/** A keyboard window: the lowest and highest MIDI pitch it draws (inclusive). */
export interface ReadoutWindow {
  low: number;
  high: number;
}

/**
 * The default readout window: C4 (60) … B5 (83), two octaves. Every readout
 * keyboard (current chord, chord list, a key's diatonic chords) is drawn on it
 * wherever its voicings fit, so changing chord only re-lights keys instead of
 * re-laying-out the keyboard, and every readout keyboard has the same shape.
 */
export const READOUT_WINDOW: ReadoutWindow = { low: 60, high: 83 };

/**
 * Fit voicings to a keyboard window: ONE joint octave shift of all of them
 * toward the window's centre, then widen the window (in whole octaves) if
 * anything still falls outside it.
 *
 * This is a CONTENT fit and nothing else. Whether the resulting range tiles
 * flush is the layout's business — `pitchGeometry` snaps its own range — so a
 * chord that needs three octaves gets three octaves here and the keyboard
 * decides what to do with them.
 *
 * The shift is a multiple of 12 because the keyboard illustrates chord *shape*,
 * not sounding octave: an octave shift is free, anything else would light the
 * wrong keys. It's computed over ALL voicings at once, so rows drawn on the
 * returned window share one frame (a chord's inversions show the bass climbing
 * from row to row) and the frame doesn't move when rows are added or hidden.
 *
 * Widening is what makes wide sets honest rather than clipped. A set of
 * inversions spans further than the chord itself, and since the shift is
 * quantized to octaves, no shift may slide it inside the window — such a set
 * gets an extra octave on the side it overflows; anything that fits keeps the
 * default window untouched.
 */
export function fitVoicings(
  voicings: readonly (readonly number[])[],
  window: ReadoutWindow = READOUT_WINDOW,
): { low: number; high: number; voicings: number[][] } {
  const all = voicings.flat();
  if (all.length === 0) {
    return {
      low: window.low,
      high: window.high,
      voicings: voicings.map((v) => [...v]),
    };
  }
  const min = Math.min(...all);
  const max = Math.max(...all);
  const center = (window.low + window.high) / 2;
  const shift = Math.round((center - (min + max) / 2) / 12) * 12;

  let low = window.low;
  let high = window.high;
  while (min + shift < low) low -= 12;
  while (max + shift > high) high += 12;

  return { low, high, voicings: voicings.map((v) => v.map((p) => p + shift)) };
}
