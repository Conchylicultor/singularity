/**
 * The pitch axis as a CONTRACT — where every pitch sits across the width of a
 * Sonata surface, independent of which keyboard layout produced it.
 *
 * Sonata used to assume the piano everywhere pitch met the screen: one
 * `keyLayout(low, high)` in the keyboard primitive, an `isBlack` flag on every
 * key, and three key skins written around "white keys tile the bottom, black
 * keys sit 62% tall on top". That made a second layout (Jankó, isomorphic)
 * unspellable. What actually varies between layouts is a handful of numbers, so
 * those numbers live here — in the zero-import narrow waist every Sonata plugin
 * already reads — while the FORMULAS that produce them live in the
 * `pitch-layout` plugin, which may import `config_v2` and this waist may not.
 *
 * Everything is a FRACTION, never a pixel: X fractions of the axis width, Y
 * fractions of the keybed height. One plane therefore serves a two-octave chip
 * and an 88-key roll alike, and a resize never re-lays anything.
 */

/**
 * Which layout a plane was laid in. A CLOSED set: `pitch-layout/core` answers
 * for each id with a `Record<PitchLayoutId, …>`, so a new layout is a tsc error
 * until it has geometry, a label and chrome. Consumers read this off a plane
 * (never off a second config read) — that is what makes chrome, geometry and
 * the persisted choice unable to disagree.
 */
export type PitchLayoutId = "piano" | "janko";

/**
 * One pad on the keybed — a thing the player can press, and the box a chrome
 * paints inside.
 *
 * X is fractions of the axis width; Y is fractions of the keybed height with
 * `top` 0 at the edge the notes fall onto. A pitch may own MORE than one pad
 * (Jankó gives every pitch two), which is why a pad is not addressed by pitch.
 */
export interface PitchKey {
  pitch: number;
  /** Center as a fraction of the axis width (0..1). */
  center: number;
  /** Width as a fraction of the axis width (0..1). */
  width: number;
  /** Top edge as a fraction of the keybed height (0 = the notes' edge). */
  top: number;
  /** Height as a fraction of the keybed height. */
  height: number;
  /**
   * Paint order; a higher tier paints over a lower one. Piano naturals are 0
   * and accidentals 1 (the black keys ride over the white ones); Jankó pads are
   * all 0, because same-parity pads never overlap within a row.
   */
  tier: number;
}

/**
 * The X column ONE pitch's falling notes occupy, in fractions of the axis width.
 *
 * A declared output, NOT a dedupe of {@link PitchKey}: on Jankó a pad is
 * `2/(N+1)` wide and overlaps each semitone neighbour by half, while a note
 * column is the non-overlapping stride `1/(N+1)` — so a chromatic run reads as
 * distinct bars instead of smearing. On the piano, column and pad coincide.
 */
export interface PitchColumn {
  pitch: number;
  center: number;
  width: number;
}

/**
 * A vertical orientation rule drawn at a column's left edge. `strong` marks the
 * layout's octave landmark (the left edge of every C); the weak rule is its
 * mid-octave partner (E–F on the piano, F# on Jankó).
 */
export interface PitchGuide {
  /** Left-edge fraction (0..1) of the column the rule sits on. */
  frac: number;
  strong: boolean;
}

/**
 * The brand. Declared as a module-private `unique symbol`, so a `PitchPlane` is
 * not even NAMEABLE structurally outside this file: the only way to obtain one
 * is {@link markLaidOut}, which `pitch-layout`'s `pitchGeometry()` is the sole
 * caller of. A hand-built object literal — a consumer "just needing a plane
 * here", or a test fixture whose columns do not agree with its pads — fails to
 * compile, so "every pad's center is its pitch's column center" is a property of
 * the type rather than a line of documentation.
 *
 * Same class of guardrail as `PageForestTx` (`page/editor/server`) and
 * `DocSourcedRuns` (`page/editor/web`).
 */
declare const laidOut: unique symbol;

/** The whole pitch axis of one surface: its pads, its note columns, its rules. */
export interface PitchPlane {
  readonly [laidOut]: true;
  /** The layout these pads were laid in — chrome reads it from here. */
  layout: PitchLayoutId;
  /** The SNAPPED inclusive MIDI range these pads cover (see `snapRange`). */
  low: number;
  high: number;
  /** Every pad, ascending by tier then pitch. A pitch may appear more than once. */
  keys: readonly PitchKey[];
  /** Exactly one per pitch in `[low, high]`, ascending, contiguous. */
  columns: readonly PitchColumn[];
  guides: readonly PitchGuide[];
}

/**
 * Mint a plane. The ONLY producer of the brand, and deliberately the whole of
 * its implementation: it adds nothing at runtime, it exists so the type system
 * can name one authorised path.
 *
 * Do not call this outside `pitch-layout`'s `pitchGeometry()`. It is exported
 * from the waist only because the waist owns the type and must not import the
 * plugin that owns the formulas.
 */
export function markLaidOut(
  plane: Omit<PitchPlane, typeof laidOut>,
): PitchPlane {
  return plane as PitchPlane;
}
