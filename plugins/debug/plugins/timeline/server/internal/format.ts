// ---------------------------------------------------------------------------
// Local-time presentation helpers for the get_timeline text report.
//
// DELIBERATELY server-only, NOT in core/: core/model.ts mandates wall-clock
// epoch ms as the ONLY clock on the wire. Local time is a presentation concern
// of this one agent-facing text tool — a rendered string never crosses the
// wire — so the timezone conversion lives here and nowhere the wire model can
// reach it.
//
// The optional `tz` argument threads an IANA zone in for deterministic tests;
// when omitted every helper resolves the host's own zone.
// ---------------------------------------------------------------------------

/** The IANA zone name shown in the report header (host zone unless overridden). */
export function tzName(tz?: string): string {
  return tz ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function parts(ms: number, tz: string | undefined, opts: Intl.DateTimeFormatOptions) {
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", ...opts });
  const map: Record<string, string> = {};
  for (const p of fmt.formatToParts(new Date(ms))) map[p.type] = p.value;
  return map;
}

/** `HH:MM:SS.mmm` in local time — the per-event stamp. */
export function formatLocal(ms: number, tz?: string): string {
  // Slow-op wall times arrive as floats (fractional ms); truncate before
  // splitting so the fraction can't leak into the rendered stamp.
  const whole = Math.floor(ms);
  const p = parts(whole, tz, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  // Milliseconds are timezone-invariant (offsets are whole minutes), so the
  // sub-second field is read straight off the Date rather than via Intl.
  const mmm = String(((whole % 1000) + 1000) % 1000).padStart(3, "0");
  return `${p.hour}:${p.minute}:${p.second}.${mmm}`;
}

/** `YYYY-MM-DD HH:MM:SS` in local time — the fuller header stamp. */
export function formatLocalFull(ms: number, tz?: string): string {
  const p = parts(ms, tz, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

/** Compact human duration: `840ms`, `3.2s`, `11m 34s`. */
export function formatDurationMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const totalSec = ms / 1000;
  if (totalSec < 60) return `${totalSec.toFixed(1)}s`;
  const min = Math.floor(totalSec / 60);
  const sec = Math.floor(totalSec % 60);
  return `${min}m ${String(sec).padStart(2, "0")}s`;
}
