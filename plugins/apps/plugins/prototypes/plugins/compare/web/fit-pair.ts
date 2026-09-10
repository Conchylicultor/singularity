/** Which way the two halves sit: side by side, or one above the other. */
export type PairDirection = "row" | "col";

export interface PairLayout {
  direction: PairDirection;
  /** The one factor both halves are painted at. Never above 1. */
  scale: number;
}

export interface PairFitInput {
  /** The room the pair may fill, in CSS px. */
  room: { width: number; height: number };
  /**
   * One half's content at 100%: the shared width, and the mock's declared
   * viewport height — the height the pair is fitted to.
   */
  unit: { width: number; height: number };
  /** Chrome above each frame that does not zoom (the half's label row), px. */
  band: number;
  /** Space between the two halves, px. */
  gap: number;
}

/**
 * Below this the pair is not legible anyway; the stage scrolls instead of
 * shrinking further (a room of 0 — a pane not laid out yet — lands here too).
 */
const MIN_SCALE = 0.05;

/**
 * The largest single zoom at which BOTH halves fit the room, and which way to
 * arrange them to get it.
 *
 * Both arrangements are tried and the bigger one wins: two wide screens side by
 * side form a strip three times wider than tall, which a landscape pane holds
 * well but a narrow one (the gallery open beside it, a portrait window) holds
 * far better stacked. The label rows and the gap do not zoom, so they come off
 * the room before dividing. Side by side wins ties — it is the natural reading
 * of a comparison — which is also what happens whenever both fit at 100%.
 *
 * Rounded DOWN to a thousandth so sub-pixel rounding can never push the pair a
 * pixel past the room and bring up a scrollbar.
 */
export function fitPair({ room, unit, band, gap }: PairFitInput): PairLayout {
  const row = Math.min(
    (room.width - gap) / (2 * unit.width),
    (room.height - band) / unit.height,
  );
  const col = Math.min(
    room.width / unit.width,
    (room.height - 2 * band - gap) / (2 * unit.height),
  );
  const rowScale = clampScale(row);
  const colScale = clampScale(col);
  return colScale > rowScale
    ? { direction: "col", scale: colScale }
    : { direction: "row", scale: rowScale };
}

function clampScale(s: number): number {
  return Math.max(MIN_SCALE, Math.min(1, Math.floor(s * 1000) / 1000));
}
