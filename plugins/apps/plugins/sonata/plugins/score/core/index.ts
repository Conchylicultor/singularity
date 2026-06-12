/**
 * `@plugins/apps/plugins/sonata/plugins/score/core` — the Sonata narrow waist.
 *
 * Pure, framework-free barrel. Re-exports the `Score` IR types, the
 * display-agnostic rich-display contracts (`Capability`, `Projection`), and the
 * pure time/merge helpers. This sub-plugin has ONLY a `core` runtime and depends
 * on nothing — it is the leaf of the Sonata DAG.
 */

export type {
  Score,
  Note,
  Annotation,
  ChordAnnotation,
  VoicingAnnotation,
  SectionAnnotation,
  TempoEvent,
  TimeSigEvent,
  TrackMeta,
  KeySignature,
  PitchSpelling,
  ChordData,
  VoicingData,
  SectionData,
  Capability,
  Projection,
  KeyLane,
} from "./types";

export {
  emptyScore,
  scoreEndBeat,
  beatToSeconds,
  scaleTempo,
  bars,
  beatGrid,
  prevLine,
  nextLine,
  currentLine,
  subdivideBars,
  mergeScores,
  mergeAnnotations,
} from "./helpers";

export type { TempoIndex } from "./tempo-index";
export { buildTempoIndex } from "./tempo-index";

export { makeKeySpeller, accidentalGlyph, spellScore } from "./spelling";
export type { KeySpeller } from "./spelling";

export {
  effectiveKeyAt,
  collectKeyEntries,
  asKeySignature,
} from "./key-context";
export type { KeyEntry } from "./key-context";
