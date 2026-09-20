// ── Which sound a chord is heard with ────────────────────────────────────────
//
// The trainer has two sounds for one chord, and they answer different
// questions:
//
//  - **the song** — the bars of the real recording where that chord plays.
//    This is the ear training: what the chord sounds like inside a record, in
//    an arrangement, under a voice.
//  - **the piano** — the app's own sampled grand, striking the chord alone.
//    This is the reference: what the chord is, with nothing else in the way.
//
// One axis, two values, because a chord is heard ONE way at a time: there is no
// "both" to spell, and no order to pick between them.
//
// It governs the ANSWER BOXES and nothing else — the chords of the loop, which
// are the only ones the song can play. The chord palette below the strip, and
// the keys of the piano itself, always sound on the piano whatever this says: a
// chord the loop does not contain has no stretch of song to play, and a single
// key never had one. That is a fact about the chord, not a preference, which is
// why it is stated here rather than left to each call site to remember.

/**
 * Every sound a chord can be heard with, in picker order. This array is the
 * single source: {@link ChordSoundSource} is derived from it, and the config's
 * options, the card's toggle and {@link asChordSoundSource} all read it, so
 * they cannot list different values.
 */
export const CHORD_SOUND_SOURCES = ["song", "piano"] as const;

/** Which sound a chord of the loop is heard with. */
export type ChordSoundSource = (typeof CHORD_SOUND_SOURCES)[number];

/**
 * Narrow a config read to {@link ChordSoundSource}. `enumField` types as
 * `string` (its zod schema, built from this same list, is what rejects an
 * unknown value), so every consumer funnels its read through this instead of
 * casting.
 *
 * Throws on an unrecognised id rather than falling back to the song: the
 * descriptor has already refused anything else, so a value arriving here that
 * is not a source is a defect to see, not to paper over.
 */
export function asChordSoundSource(value: string): ChordSoundSource {
  const source = CHORD_SOUND_SOURCES.find((s) => s === value);
  if (source === undefined) {
    throw new Error(
      `asChordSoundSource: unknown chord sound "${value}" (expected one of ${CHORD_SOUND_SOURCES.join(", ")})`,
    );
  }
  return source;
}
