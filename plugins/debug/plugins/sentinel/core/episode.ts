import { z } from "zod";

// Duress-episode transition lines (Track O Stage 3,
// research/2026-07-11-global-observability-freeze-blind-spots.md): the sentinel
// worker — the latch's sole writer — appends one line per trip/clear to the
// persisted `duress-episodes` log channel on main's log dir (the boot-events
// pattern: no DB table, survives re-forks, readable while a backend is wedged).
//
// Every line carries `episodeSetAt` (the latch's `setAt`, the episode's
// identity AND its trip instant), so a single line fully determines its
// interval: a clear line alone is [episodeSetAt, atMs]; a trip line alone is
// [atMs, open). A lapse-clear (lease expired with no writer alive) has no
// line — accepted gap, the worker lifecycle makes it rare.
export const DURESS_EPISODES_CHANNEL = "duress-episodes";

export const DuressEpisodeEventSchema = z.object({
  /** Wall-clock ms epoch of the transition itself. */
  atMs: z.number(),
  kind: z.enum(["trip", "clear"]),
  /** The trip cause; a forced clear prefixes it (e.g. "max-episode-hold: …"). */
  reason: z.string(),
  /** The latch's setAt — episode identity, and the trip instant on clear lines. */
  episodeSetAt: z.number(),
});
export type DuressEpisodeEvent = z.infer<typeof DuressEpisodeEventSchema>;

// The jsonb payload for a `duress-episode` report — filed once per episode, on
// clear, from onset.ts:handleClearFrame (WS3,
// research/2026-07-17-global-debug-surface-consolidation.md). The report is the
// missing report/bell half of the duress signal; the trip instant is already
// covered by the cluster-onset trace + the timeline duress band. Fingerprinted
// per CAUSE-SIGNATURE (sorted `elevated`), NOT per episode, so a storm of
// episodes with the same cause collapses to one counted row.
export const DuressEpisodeReportPayloadSchema = z.object({
  /** The trip cause string (e.g. "cluster-onset: decompressionsPerSec"). */
  reason: z.string(),
  /** The elevated signal names at trip — the fingerprint's cause-signature. */
  elevated: z.array(z.string()),
  /** The latch's setAt (episode identity + trip instant), wall-clock ms epoch. */
  episodeSetAt: z.number(),
  /** The clear instant, wall-clock ms epoch. */
  endedAt: z.number(),
  /** endedAt − episodeSetAt. */
  durationMs: z.number(),
  /** True when the episode was force-cleared by max-episode-hold (not a natural calm). */
  forced: z.boolean(),
});
export type DuressEpisodeReportPayload = z.infer<
  typeof DuressEpisodeReportPayloadSchema
>;
