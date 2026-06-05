import { z } from "zod";

/**
 * A persisted Sonata song — **source-agnostic** generic metadata only. The raw
 * per-source data (e.g. the MIDI attachment, a chord-grid's JSON) lives in each
 * source's own entity-extension side-table, owned by that source plugin; the
 * core row never names a source. `durationSec`/`endBeat` are score-level (the
 * composed timeline's length), not tied to any one source.
 *
 * `createdAt` is an ISO string (it crosses the wire as JSON; the server maps the
 * DB `Date` to `.toISOString()` in the resource loader).
 */
export const SongSchema = z.object({
  id: z.string(),
  title: z.string(),
  composer: z.string().nullable(),
  durationSec: z.number(),
  endBeat: z.number(),
  createdAt: z.string(),
});

export type Song = z.infer<typeof SongSchema>;
