import { z } from "zod";
import {
  HookpadHarmonyDocSchema,
  TheorytabSectionIdSchema,
} from "@plugins/integrations/plugins/hooktheory/core";
import { beatTimesAlignment, type Alignment } from "./beat-time";

// ── The compact source snapshot: one ndjson line per section ─────────────────
//
// `sheetsage-<dump sha>.ndjson.gz` holds only the SOURCE fields the index
// needs, copied verbatim from Sheet Sage's two files (pinned commit
// 06113c04b109a2f27517b0399ff47550099f2466). No token, feature or window: those
// are derived (`deriveSection`), so a new converter never rebuilds the snapshot.
// No melody (`notes`): the trainer does not use it and it is the largest part.
//
// A line is either a section or a skip: a source entry the builder could not
// turn into a section (no document, no display names, …). Skips are written
// rather than dropped so every load can report the whole dump's accounting.

/**
 * Bump when a line's shape changes; it belongs in the snapshot file's name next
 * to the dump sha, so an old snapshot is rebuilt rather than misread.
 */
export const SNAPSHOT_FORMAT_VERSION = 1;

/**
 * One of Sheet Sage's alignments, verbatim from the processed file
 * (`alignment.user` / `alignment.refined`): parallel `beats` and `times`
 * (seconds into the video). Beats are Sheet Sage's, **0-based**.
 */
export const SheetSageBeatTimesSchema = z.object({
  beats: z.array(z.number()),
  times: z.array(z.number()),
});

/**
 * The processed file's `alignment`, minus `swing` (the Hookpad tempos carry it).
 * Measured on the pinned file (26,175 sections): `refined` (one point per beat)
 * in 17,980, `user` (two points: section start and end) in 22,217, neither in
 * 3,958. `refined` is only ever present alongside `user`.
 */
export const SheetSageAlignmentSchema = z.object({
  user: SheetSageBeatTimesSchema.nullable(),
  refined: SheetSageBeatTimesSchema.nullable(),
});
export type SheetSageAlignment = z.infer<typeof SheetSageAlignmentSchema>;

// The harmony schema, not the whole document's: the melody is never read, so a
// melody Hookpad itself got wrong (notes on a `null` beat) cannot refuse a section.
const doc = HookpadHarmonyDocSchema.shape;

export const SnapshotSectionSchema = z.object({
  /** The TheoryTab section id: the key both Sheet Sage files share. */
  id: TheorytabSectionIdSchema,
  /** Display names, from the raw file's API record (`json_api.artist` / `song` / `section`, e.g. "Chorus"). */
  artist: z.string(),
  song: z.string(),
  sectionName: z.string(),
  /** URL slugs, from the processed file (`hooktheory.artist` / `song`). The worktree sample hashes these. */
  artistSlug: z.string(),
  songSlug: z.string(),
  /**
   * The raw document's `youtube` (`id` as pasted, `syncStart`/`syncEnd` as
   * fractions), plus the processed file's `youtube.duration` in seconds
   * (`null` in 3,927 sections).
   */
  youtube: doc.youtube.extend({
    durationSeconds: z.number().nullable(),
  }),
  /** The raw Hookpad document's harmony and maps, every field kept. 1-based beats. */
  chords: doc.chords,
  keys: doc.keys,
  meters: doc.meters,
  tempos: doc.tempos,
  endBeat: doc.endBeat,
  alignment: SheetSageAlignmentSchema,
  /** Sheet Sage's tags (`AUDIO_AVAILABLE`, `KEY_CHANGES`, `REFINED_ALIGNMENT`, …). */
  tags: z.array(z.string()),
});
export type SnapshotSection = z.infer<typeof SnapshotSectionSchema>;

/**
 * Why the builder wrote no section for a source entry. A closed list:
 *
 * - `no-document` — the raw entry has no Hookpad document (`json` is null).
 * - `no-display-names` — the raw entry has no API record (`json_api`), so no
 *   artist, song or section name to show.
 * - `no-processed-section` — a raw document with no processed section: no
 *   slugs, no video duration, no alignment.
 * - `no-raw-entry` — a processed section with no raw entry: no chord spelling.
 * - `document-refused` — the document does not match the harmony schema.
 */
export const SNAPSHOT_SKIP_REASONS = [
  "no-document",
  "no-display-names",
  "no-processed-section",
  "no-raw-entry",
  "document-refused",
] as const;
export const SnapshotSkipReasonSchema = z.enum(SNAPSHOT_SKIP_REASONS);
export type SnapshotSkipReason = z.infer<typeof SnapshotSkipReasonSchema>;

/**
 * A skip line. The slugs are there when the processed file knew the section,
 * so a sample load can tell whether the skip is in its scope.
 */
export const SnapshotSkipSchema = z.object({
  kind: z.literal("skipped"),
  id: TheorytabSectionIdSchema,
  reason: SnapshotSkipReasonSchema,
  detail: z.string(),
  artistSlug: z.string().nullable(),
  songSlug: z.string().nullable(),
});
export type SnapshotSkip = z.infer<typeof SnapshotSkipSchema>;

/** One line of the snapshot file. */
export const SnapshotLineSchema = z.discriminatedUnion("kind", [
  SnapshotSectionSchema.extend({ kind: z.literal("section") }),
  SnapshotSkipSchema,
]);
export type SnapshotLine = z.infer<typeof SnapshotLineSchema>;

/**
 * The index's alignment from Sheet Sage's: the per-beat one when there is one,
 * else the start/end one, shifted from Sheet Sage's 0-based beats to Hookpad's
 * 1-based ones; `none` when the section has neither.
 */
export function alignmentFromSheetSage(
  alignment: SheetSageAlignment,
): Alignment {
  const source = alignment.refined ?? alignment.user;
  if (source === null) return { kind: "none" };
  return beatTimesAlignment(
    source.beats.map((beat) => beat + 1),
    source.times,
  );
}
