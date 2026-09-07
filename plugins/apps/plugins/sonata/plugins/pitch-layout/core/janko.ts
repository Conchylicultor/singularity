import type {
  PitchColumn,
  PitchGuide,
  PitchKey,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import type { PitchLayout } from "./geometry";

/**
 * The Jankó (isomorphic) keyboard, as fractions.
 *
 * Every pad is the same size and every semitone is offset half a pad from the
 * one below it, so a chord SHAPE is the same shape in every key — the whole
 * point of the layout, and the reason it is worth carrying a second geometry at
 * all. Because x stays LINEAR in pitch, the falling notes of a piano roll map
 * onto it unchanged; a hex layout (Wicki-Hayden) would not, which is why this
 * is the isomorphic layout Sonata offers.
 *
 * v1 is FOUR rows — the physical instrument's two-row pattern duplicated — so
 * every pitch has two pads and a hand can take a chord in whichever octave-band
 * of rows falls under it. `ROWS` is not a knob: the parity table below is
 * written for four.
 */

/** Rows of pads, indexed 0 at the TOP (the edge the notes fall onto). */
const ROWS = 4;

/**
 * Which rows a pitch of parity `q` (`pitch % 2`) occupies: `1 - q` and `3 - q`.
 *
 * Read top→bottom the row parities are odd, even, odd, even — so the row
 * NEAREST THE PLAYER (row 3) is the even-MIDI row, C D E F♯ G♯ A♯, exactly as
 * on a physical Jankó. That is the whole content of the offset: a player's
 * hand finds C on the bottom row in every octave.
 */
const rowsForParity = (q: number): [number, number] => [1 - q, 3 - q];

/** Jankó tiles any range flush, so there is nothing to widen to. */
function snapRange(low: number, high: number): { low: number; high: number } {
  return { low, high };
}

function lay(
  low: number,
  high: number,
): { keys: PitchKey[]; columns: PitchColumn[]; guides: PitchGuide[] } {
  const n = high - low + 1;
  if (n <= 0) return { keys: [], columns: [], guides: [] };

  // A pad is TWO strides wide and a stride is `1 / (N + 1)`, so the first pad's
  // left edge lands on 0 and the last pad's right edge on 1: the keybed is
  // covered edge to edge with no dead zone, and each pad overlaps each semitone
  // neighbour by exactly half. The extra `+1` in the denominator is that
  // half-pad of overhang at each end.
  const stride = 1 / (n + 1);
  const padW = 2 * stride;
  const rowH = 1 / ROWS;

  const keys: PitchKey[] = [];
  const columns: PitchColumn[] = [];
  for (let i = 0; i < n; i++) {
    const pitch = low + i;
    // Both pads of a pitch share this center — which is also its note column's
    // center, so a falling note lands on both of its pads.
    const center = (i + 1) * stride;
    // Ascending by pitch and, within a pitch, by row: the plane's declared
    // order (tier, then pitch) with every pad on tier 0, since same-parity pads
    // never overlap within a row and so need no paint order between them.
    for (const row of rowsForParity(((pitch % 2) + 2) % 2)) {
      keys.push({
        pitch,
        center,
        width: padW,
        top: row * rowH,
        height: rowH,
        tier: 0,
      });
    }
    // The note column is the STRIDE, not the pad: pads overlap by half, and a
    // chromatic run drawn at pad width would smear into one block.
    columns.push({ pitch, center, width: stride });
  }
  keys.sort((a, b) => a.pitch - b.pitch || a.top - b.top);

  // Every octave of an isomorphic keyboard looks identical, so the orientation
  // rules do more work here than on a piano: strong at every C, weak at every
  // F♯ — the midpoint of the six-pad row cycle. There is no E–F seam to mark.
  const guides: PitchGuide[] = columns
    .filter((c) => {
      const pc = ((c.pitch % 12) + 12) % 12;
      return pc === 0 || pc === 6;
    })
    .map((c) => ({
      frac: c.center - c.width / 2,
      strong: ((c.pitch % 12) + 12) % 12 === 0,
    }));

  return { keys, columns, guides };
}

export const jankoLayout: PitchLayout = {
  snapRange,
  lay,
  // Four rows need more room than the piano's single row of keys; the chip is
  // sized so a four-row pad is still tappable. Both are deliberate choices to
  // tune on screenshot, not a formula.
  heights: { keybed: 140, chip: 64 },
};
