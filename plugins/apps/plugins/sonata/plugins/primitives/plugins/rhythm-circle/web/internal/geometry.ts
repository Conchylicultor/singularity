/**
 * Pure SVG geometry for the rhythm circle. No React, no Sonata — plain numbers,
 * so the whole primitive stays trivially unit-testable and domain-agnostic.
 *
 * The circle is drawn in a fixed 0..VIEWBOX user-space square centred at
 * ({@link CENTER}, {@link CENTER}); the consumer's `size` only scales the SVG.
 * Index 0 sits at 12 o'clock and indices increase CLOCKWISE — the same polar
 * convention `circle-of-fifths.tsx` uses: `[cx + r·sin(a), cy − r·cos(a)]`.
 */

/** User-space side length of the fixed viewBox. */
export const VIEWBOX = 100;
/** Centre of the circle, in user space. */
export const CENTER = VIEWBOX / 2;
/** Radius of the outermost ring (tracks[0]). */
export const R_OUTER = 42;
/** Radius of the innermost ring — leaves a centre hole for the needle hub. */
export const R_INNER = 15;

/** Point at `r` units from (`cx`,`cy`), `deg` clockwise from 12 o'clock. */
export function point(
  cx: number,
  cy: number,
  r: number,
  deg: number,
): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.sin(a), cy - r * Math.cos(a)];
}

/**
 * Radius of ring `index` of `count` rings. Ring 0 is outermost (`R_OUTER`);
 * successive rings step inward in equal increments down to `R_INNER`. A single
 * ring sits on `R_OUTER`.
 */
export function ringRadius(index: number, count: number): number {
  if (count <= 1) return R_OUTER;
  return R_OUTER - ((R_OUTER - R_INNER) * index) / (count - 1);
}

/** Radial gap between adjacent rings for a given ring count. */
export function ringGap(count: number): number {
  return count > 1 ? (R_OUTER - R_INNER) / (count - 1) : R_OUTER - R_INNER;
}

/**
 * Bead radius for a ring: small enough that neighbouring beads on the ring don't
 * touch (bounded by the chord between adjacent pulses) and that adjacent rings
 * stay clear (bounded by the ring gap), clamped to a sane visual maximum.
 */
export function beadRadius(
  radius: number,
  subdivisions: number,
  gap: number,
): number {
  const chord =
    subdivisions > 1 ? 2 * radius * Math.sin(Math.PI / subdivisions) : radius;
  return Math.max(1, Math.min(3.4, chord * 0.42, gap * 0.42));
}

/** Angle (deg, clockwise from top) of pulse `index` on a ring of `subdivisions`. */
export function pulseAngle(index: number, subdivisions: number): number {
  return subdivisions > 0 ? (index * 360) / subdivisions : 0;
}
