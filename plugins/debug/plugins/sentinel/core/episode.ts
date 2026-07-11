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
