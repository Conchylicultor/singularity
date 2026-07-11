import type { TimelineEvent } from "../../../core";
import { HOST_LANE } from "../../../shared/frames";
import { overlapsWindow } from "../window";

// Structural view of a duress-episodes line — the pure mapping stays testable
// without importing the sentinel reader (and its log-channels chain).
export interface DuressLineLike {
  atMs: number; // wall-clock epoch ms of the transition
  kind: "trip" | "clear";
  reason: string;
  episodeSetAt: number; // episode identity == trip instant
}

// The longest an unpaired-trip episode can plausibly still be held: the
// sentinel force-clears any longer hold (max-episode-hold, WITH a clear
// line), so an older trip with no line has certainly lapsed — a lease expiry
// writes no line (the accepted gap, Track O Stage 3). Mirrors sentinelConfig's
// maxEpisodeHoldMs default; it's config'd there, so this render-side bound is
// a calibratable constant, not a hard truth.
export const MAX_OPEN_EPISODE_MS = 30 * 60_000;

/**
 * Duress transition lines → one warning interval event per episode. Every
 * line carries `episodeSetAt` (episode identity AND trip instant), so no
 * cross-line pairing is load-bearing: a clear line alone is the full interval
 * [episodeSetAt, atMs] even when its trip predates the read window.
 *
 * An episode with no clear line either is live right now (its provable bound
 * — trip + MAX_OPEN_EPISODE_MS, or the next episode's trip, whichever is
 * sooner — lies past the window edge: render open-ended to `toMs` with the
 * in-flight pulse) or lapsed at an unknown time (bound inside the window:
 * render to the bound with `detail.endUnknown` — never still-open forever).
 */
export function mapDuressEpisodes(
  lines: readonly DuressLineLike[],
  fromMs: number,
  toMs: number,
): TimelineEvent[] {
  const trips = new Map<number, DuressLineLike>();
  const clears = new Map<number, DuressLineLike>();
  for (const line of lines) {
    if (line.kind === "trip") {
      if (!trips.has(line.episodeSetAt)) trips.set(line.episodeSetAt, line);
    } else {
      clears.set(line.episodeSetAt, line); // last clear wins (there should be one)
    }
  }
  const episodeStarts = [...new Set([...trips.keys(), ...clears.keys()])].sort((a, b) => a - b);

  const events: TimelineEvent[] = [];
  for (let i = 0; i < episodeStarts.length; i++) {
    const episodeSetAt = episodeStarts[i]!;
    const trip = trips.get(episodeSetAt);
    const clear = clears.get(episodeSetAt);
    const reason = trip?.reason ?? clear!.reason;

    let endMs: number;
    let open = false;
    let endUnknown = false;
    if (clear !== undefined) {
      endMs = clear.atMs;
    } else {
      const next = episodeStarts[i + 1];
      const bound = Math.min(episodeSetAt + MAX_OPEN_EPISODE_MS, next ?? Number.POSITIVE_INFINITY);
      if (bound >= toMs) {
        open = true;
        endMs = toMs;
      } else {
        endUnknown = true;
        endMs = bound;
      }
    }
    if (!overlapsWindow(episodeSetAt, endMs, fromMs, toMs)) continue;

    events.push({
      id: `duress:${episodeSetAt}`,
      source: "duress" as const,
      // Duress is host-global — it rides the HOST_LANE, not a worktree group.
      worktree: HOST_LANE,
      startMs: episodeSetAt,
      endMs,
      label: `duress: ${reason}`,
      severity: "warning" as const,
      detail: {
        reason,
        episodeSetAt,
        ...(clear !== undefined
          ? { clearedAtMs: clear.atMs, clearReason: clear.reason }
          : { open, endUnknown, inFlight: open }),
      },
    });
  }
  return events;
}
