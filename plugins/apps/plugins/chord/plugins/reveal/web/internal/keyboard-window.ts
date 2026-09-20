/**
 * The keyboard the reveal card draws: C3 to C6, three octaves. Wide enough for
 * any chord `chordVoicing` produces — it pins every chord's bass to the pitch
 * nearest middle C (F♯3–F4), so a triad or seventh sits comfortably inside —
 * with room above for a chord stacked past an octave.
 */
const DEFAULT_LOW = 48;
const DEFAULT_HIGH = 84;

/**
 * The window a set of notes is drawn in: the default, widened OUTWARD by whole
 * octaves while any note falls outside it.
 *
 * Two rules, both deliberate:
 *
 *  - **Never shifted, only widened.** Shifting the window to follow a chord
 *    would move every key under the learner's eyes from chord to chord. The
 *    voicings are already pinned to one register, so the default fits nearly
 *    everything and the window stays put — changing chord then only re-lights
 *    keys instead of re-laying the keyboard out.
 *  - **Whole octaves.** A window that grows by a semitone would start and end
 *    on a different note each time; growing by an octave keeps the same C at
 *    each end.
 *
 * Pure and total: no notes is the default window, and any set of pitches has an
 * answer.
 */
export function keyboardWindowFor(notes: readonly number[]): {
  low: number;
  high: number;
} {
  let low = DEFAULT_LOW;
  let high = DEFAULT_HIGH;
  for (const pitch of notes) {
    while (pitch < low) low -= 12;
    while (pitch > high) high += 12;
  }
  return { low, high };
}
