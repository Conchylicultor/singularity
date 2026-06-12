/**
 * Range-parameterized piano-key geometry — the canonical layout for a stretch of
 * keys spanning any MIDI `[low, high]`. Centers and widths are FRACTIONS of the
 * total width (0..1), so a consumer scales to its own pixel width via CSS
 * percentages and the same layout serves a 2-octave chip or an 88-key roll.
 *
 * White keys tile edge-to-edge (`whiteW = 1 / whiteCount`); each black key
 * centers on the boundary just above its lower white neighbour, drawn narrower.
 * Pure — the single source of the key formula: the piano-roll's pixel `keyLayout`
 * scales these fractions by its lane width, so the falling notes and every
 * keyboard renderer share one geometry.
 */

/** Black keys are this fraction of a white key's width. */
const BLACK_WIDTH_RATIO = 0.62;
/** White pitch classes (C D E F G A B). */
const WHITE_PCS = new Set([0, 2, 4, 5, 7, 9, 11]);

/** True for the five accidental pitch classes (black keys). */
export function isBlackPitch(pitch: number): boolean {
  return !WHITE_PCS.has(((pitch % 12) + 12) % 12);
}

/** One key's placement within the keyboard, as fractions of total width. */
export interface KeyLane {
  pitch: number;
  isBlack: boolean;
  /** Center as a fraction of total width (0..1). */
  center: number;
  /** Width as a fraction of total width (0..1). */
  width: number;
}

/**
 * Lay out every key in `[low, high]` (inclusive), white keys tiling the full
 * width and black keys riding the boundaries. `low`/`high` should be white
 * pitches (typically a C..B octave span) so the row starts and ends flush.
 */
export function keyLayout(low: number, high: number): KeyLane[] {
  let whiteCount = 0;
  for (let pitch = low; pitch <= high; pitch++) {
    if (!isBlackPitch(pitch)) whiteCount++;
  }
  if (whiteCount === 0) return [];

  const whiteW = 1 / whiteCount;
  const blackW = whiteW * BLACK_WIDTH_RATIO;

  const lanes: KeyLane[] = [];
  let whiteIndex = 0;
  for (let pitch = low; pitch <= high; pitch++) {
    if (!isBlackPitch(pitch)) {
      lanes.push({
        pitch,
        isBlack: false,
        center: whiteIndex * whiteW + whiteW / 2,
        width: whiteW,
      });
      whiteIndex++;
    } else {
      // The boundary between the white key just below and the next one.
      lanes.push({ pitch, isBlack: true, center: whiteIndex * whiteW, width: blackW });
    }
  }
  return lanes;
}
