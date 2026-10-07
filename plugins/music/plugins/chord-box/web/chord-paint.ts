import "./chord-box.css";

/**
 * The named paints a chord surface wears (`chord-box.css`):
 *
 * - `tile` — solid: a chord that is named (a filled box, a lit button, a
 *   practised chip).
 * - `tint` — outline and light wash: a chord on but not asked (a Hear chip).
 * - `tint-quiet` — the tint, quieter: a given box, which must recede beside
 *   the boxes being asked.
 * - `ghost` — off or empty: a dashed neutral edge, a faint numeral.
 */
export type ChordPaint = "tile" | "tint" | "tint-quiet" | "ghost";

/**
 * The classes that paint a chord surface: `.chord-tone` (the chord's derived
 * colours, from the `--fn` that `chordToneStyle` sets) and the paint itself.
 * A surface maps its own state to a paint here and never re-states a chord
 * colour in its CSS.
 */
export function chordPaint(paint: ChordPaint): string {
  return `chord-tone chord-${paint}`;
}
