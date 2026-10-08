import { z } from "zod";
import { UgTabSchema } from "@plugins/apps/plugins/sonata/plugins/sources/plugins/ultimate-guitar/plugins/tab/core";
import { fitsSheet } from "./aligned-score";
import { AlignmentRecordSchema, type AlignmentRecord } from "./record";
import type { UgAlignmentRow } from "./row";

/**
 * The Ultimate Guitar source's raw — what `Library.Source.hydrate` returns and
 * `compile()` reads: the persisted tab, plus the alignment to apply to it.
 *
 * `alignment` is the APPLIED record only: `null` for a song with no record yet
 * (no video, still aligning, failed). A weak match IS applied — the song plays
 * on its best try, labelled unconfirmed. `compile()` still checks it against
 * the tab (`fitsSheet`), so a record left over from an earlier sheet can never
 * be misapplied.
 *
 * Declared here rather than in the UG plugin because it names the alignment
 * record, and the UG plugin's own `core` cannot import this one (this core reads
 * the tab model, so the reverse edge would be a cycle).
 */
export const UgSourceRawSchema = z.object({
  tab: UgTabSchema,
  alignment: AlignmentRecordSchema.nullable(),
});
export type UgSourceRaw = z.infer<typeof UgSourceRawSchema>;

/**
 * The record a song's alignment row puts into `raw.alignment` for the sheet
 * `content`: its record, when it `fitsSheet` (same sheet, chords still in place
 * — whichever aligner made it) and
 * belongs to the row's video — or, with no video chosen, is the resolver's best
 * try kept by `needs-video` — else `null`. Its score plays no part: a weak
 * match plays too (the Recording section labels it unconfirmed). Nor does the
 * row's `status`: a re-align queued or running, or one that failed, leaves the
 * last alignment of this video and sheet playing.
 *
 * The one rule `hydrate` and the sync effect both apply, so a song opens with
 * exactly the alignment the effect would have written, and opening it never
 * resets playback a second time.
 */
export function appliedAlignment(
  row: Pick<UgAlignmentRow, "videoId" | "record"> | null,
  content: string,
): AlignmentRecord | null {
  if (row === null || row.record === null) return null;
  const { record, videoId } = row;
  // A chosen video's record must be that video's: setting a new video drops
  // the old one's at once. With none chosen, the record is the resolver's
  // best try (`needs-video`) — "Find a video" clears it.
  if (videoId !== null && record.videoId !== videoId) return null;
  return fitsSheet(record, content) ? record : null;
}
