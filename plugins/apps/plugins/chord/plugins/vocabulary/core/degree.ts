import {
  parseChordToken,
  type ChordToken,
} from "@plugins/apps/plugins/chord/plugins/song-index/core";

// ── Where a chord's root sits in the major scale ─────────────────────────────
//
// Tokens are relative to the tonic, so the degree is read straight off the
// root: no key is needed.

/** Semitones above the tonic of each major-scale degree, I to vii. */
const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11] as const;

export type ChordFunction = "tonic" | "subdominant" | "dominant";

/**
 * The function family of each degree, as the mockup groups them: I, iii, vi
 * are tonic; ii, IV subdominant; V, vii° dominant.
 */
const FUNCTION_OF_DEGREE: readonly ChordFunction[] = [
  "tonic",
  "subdominant",
  "tonic",
  "subdominant",
  "dominant",
  "tonic",
  "dominant",
];

/** The root's major-scale degree, 0 (I) to 6 (vii); `null` for a root outside the scale (♭VII, ♭III, …). */
export function chordDegree(token: ChordToken): number | null {
  const { root } = parseChordToken(token);
  const degree = MAJOR_SCALE.findIndex((pc) => pc === root);
  return degree === -1 ? null : degree;
}

/** The degree's function family; `null` for a root outside the major scale. */
export function chordFunction(token: ChordToken): ChordFunction | null {
  const degree = chordDegree(token);
  if (degree === null) return null;
  const fn = FUNCTION_OF_DEGREE[degree];
  if (fn === undefined) throw new Error(`No function for degree ${degree}`);
  return fn;
}

/** The key that answers this chord, "1" (I) to "7" (vii); `null` for a root outside the major scale. */
export function chordShortcutKey(token: ChordToken): string | null {
  const degree = chordDegree(token);
  return degree === null ? null : String(degree + 1);
}
