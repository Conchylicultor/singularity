// ── Where a chord's root sits in the major scale ─────────────────────────────

/** Semitones above the tonic of each major-scale degree, I to vii. */
const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11] as const;

/** A major-scale degree: 0 (I) to 6 (vii). */
export type MajorDegree = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * The major-scale degree of `rootPc` in the key whose tonic is `tonicPc` (both
 * pitch classes, any integer — read mod 12): 0 (I) to 6 (vii), or `null` for a
 * root outside the scale (♭VII, ♭III, …).
 */
export function majorDegree(
  rootPc: number,
  tonicPc: number,
): MajorDegree | null {
  const interval = (((rootPc - tonicPc) % 12) + 12) % 12;
  const degree = MAJOR_SCALE.findIndex((pc) => pc === interval);
  return degree === -1 ? null : (degree as MajorDegree);
}
