import { z } from "zod";

/**
 * The aligner's version: part of every stored record. Bump it when the
 * aligner's output changes meaning — `compile()` only applies a record whose
 * `alignerVersion` is current, and the job re-aligns a stale one.
 */
export const ALIGNER_VERSION = 1;

/** One sheet chord occurrence in the performance, over beat indices `[startBeat, endBeat)`. */
export const ChordSegmentSchema = z.object({
  kind: z.literal("chord"),
  /** Indices into the parsed tab: `sections[section].lines[line].chords[chord]`. */
  section: z.number().int().nonnegative(),
  line: z.number().int().nonnegative(),
  chord: z.number().int().nonnegative(),
  /**
   * Which performance of its section this is (0-based, counting every time the
   * performance enters that sheet section — a "Chorus x2" yields 0 then 1).
   */
  occurrence: z.number().int().nonnegative(),
  startBeat: z.number().int().nonnegative(),
  endBeat: z.number().int().positive(),
});

/** A passage of the recording the sheet does not cover (intro, solo, outro…). */
export const GapSegmentSchema = z.object({
  kind: z.literal("gap"),
  startBeat: z.number().int().nonnegative(),
  endBeat: z.number().int().positive(),
});

export const AlignmentSegmentSchema = z.discriminatedUnion("kind", [
  ChordSegmentSchema,
  GapSegmentSchema,
]);
export type AlignmentSegment = z.infer<typeof AlignmentSegmentSchema>;

/**
 * Contract 2 of the Sonata sheet-alignment work
 * (`research/2026-09-29-apps-sonata-ug-sheet-alignment.md`): one sheet aligned
 * to one recording. Produced by `alignChords`, stored per song, read by the UG
 * `compile()` (via `alignedScore`) and, later, by video resolution (`score`).
 */
export const AlignmentRecordSchema = z.object({
  alignerVersion: z.number().int().positive(),
  videoId: z.string(),
  /** Which beat features it was computed from. */
  analysisVersion: z.number().int().positive(),
  settingsKey: z.string(),
  /** `sheetHash(tab.content)` of the sheet it was aligned against. */
  sheetHash: z.string(),
  durationSec: z.number().positive(),
  /** The beat grid used (the features' beats, chroma dropped). */
  beats: z.array(
    z.object({ t: z.number().nonnegative(), downbeat: z.boolean() }),
  ),
  /** Semitones: recording = sheet + transpose. In [0, 12); a capo shows up here. */
  transpose: z.number().int().min(0).max(11),
  /** Performance order, contiguous, covering beat indices `[0, beats.length)`. */
  segments: z.array(AlignmentSegmentSchema),
  /** One per bar (downbeat to next downbeat; the beats before the first downbeat form bar 0), 0–1. */
  barConfidence: z.array(z.number().min(0).max(1)),
  /**
   * Overall fit, 0–1: what candidates are compared with. How much of the
   * achievable chord fit the sheet's sequence explains, times the fraction of
   * the sheet's chords the performance plays (see `align.ts`).
   */
  score: z.number().min(0).max(1),
});
export type AlignmentRecord = z.infer<typeof AlignmentRecordSchema>;

/**
 * Below this overall `score` an alignment is a weak match: the resolver keeps
 * looking for a better video (`walkCandidates`). It is still applied to the
 * Score — the song plays on its best try, labelled unconfirmed — so this
 * decides only the search, never the playing. Calibrated on the
 * reference songs (see the plan doc): the right recordings scored 0.70–0.91,
 * the wrong ones at most 0.34.
 */
export const WEAK_MATCH_THRESHOLD = 0.5;

/**
 * Stable hash of a sheet's markup: a record applies only to the exact sheet it
 * was aligned against. FNV-1a 64-bit, hex — pure and synchronous so the browser
 * `compile()` can check it.
 */
export function sheetHash(content: string): string {
  let h = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let i = 0; i < content.length; i++) {
    h ^= BigInt(content.charCodeAt(i));
    h = (h * prime) & mask;
  }
  return h.toString(16).padStart(16, "0");
}
