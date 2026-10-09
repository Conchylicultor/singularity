/**
 * The diatonic scales, as semitones above the tonic per 1-based degree — the one
 * home for the mode → scale mapping. `roman.ts` reads it to resolve a numeral's
 * root; `diatonic.ts` stacks its thirds to build the key's chords.
 */

import type { KeySignature } from "@plugins/apps/plugins/sonata/plugins/score/core";

const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11] as const;
const MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10] as const; // natural minor

/** Semitones above the tonic of each diatonic degree (index = degree − 1). */
export function scaleOf(mode: KeySignature["mode"]): readonly number[] {
  return mode === "major" ? MAJOR_SCALE : MINOR_SCALE;
}
