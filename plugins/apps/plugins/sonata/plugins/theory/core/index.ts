/**
 * `@plugins/apps/plugins/sonata/plugins/theory/core` — Sonata's chord-theory
 * primitives.
 *
 * Pure, framework-free barrel. Owns the chord vocabulary (quality ↔ intervals ↔
 * symbol) and a forward chord-symbol parser. Both the chord-analyzer (notes →
 * chord) and chord-authoring sources (chord → notes) consume it, so the
 * vocabulary has exactly one home. Imports only `score/core` (for `ChordData`),
 * keeping the DAG acyclic.
 */

export type { ChordTemplate } from "./chords";
export {
  PC_NAMES,
  CHORD_TEMPLATES,
  qualityToIntervals,
  qualitySymbol,
  formatChordSymbol,
  formatSpelledChordSymbol,
} from "./chords";
export { chordPitches, invertVoicing } from "./voicing";
export { parseChordSymbol } from "./parse";
export { parseKeySignature } from "./key";
export { detectChord, detectChordWeighted, detectChordWindows } from "./detect";
export type { ChordMatch, ChordWindow } from "./detect";
export { inferKeys } from "./key-detect";
