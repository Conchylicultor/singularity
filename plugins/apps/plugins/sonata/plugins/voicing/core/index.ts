/**
 * `@plugins/apps/plugins/sonata/plugins/voicing/core` — Sonata's chord-voicing
 * primitives.
 *
 * Pure, framework-free barrel. Owns the voicing-strategy registry that turns
 * timed chord events into performed notes. Every chord-authoring source feeds
 * its `ChordEvent[]` here, so the chord → notes direction has exactly one home.
 * Imports `score/core` (for `Note`) and `theory/core` (for `chordPitches`),
 * keeping the DAG acyclic.
 */

export type { ChordEvent, Voicing, VoicingOptions } from "./voicing";
export { VOICINGS, DEFAULT_VOICING_ID, findVoicing } from "./voicing";
