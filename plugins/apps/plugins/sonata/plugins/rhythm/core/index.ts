/**
 * `@plugins/apps/plugins/sonata/plugins/rhythm/core` — Sonata's rhythm-necklace
 * data model.
 *
 * Pure, framework-free barrel. Owns the preset rhythm registry (Tresillo, Son,
 * Bossa Nova, …) and the pure operations that rotate, resample, and edit an
 * onset pattern. A leaf that imports nothing — it speaks only plain numbers, so
 * the rhythm circle and the per-hand chord-grid grooves reuse one home for
 * "*when* each hand strikes", keeping the DAG acyclic.
 *
 * `findRhythm` throws on an unknown id (mirrors `findVoicing`): an unknown id is
 * a bug, not an absorbable empty value.
 */

export type {
  RhythmPattern,
  NamedRhythm,
  RhythmHands,
} from "./pattern";
export {
  patternFromPreset,
  effectiveOnsets,
  rotate,
  resample,
  toggleOnset,
  defaultBassPattern,
  defaultChordPattern,
} from "./pattern";
export { RHYTHMS, findRhythm } from "./presets";
