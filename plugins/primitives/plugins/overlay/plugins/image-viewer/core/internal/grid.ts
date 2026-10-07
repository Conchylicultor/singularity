/**
 * The grid view's pure parts: the tile-size range the slider moves through,
 * and how the arrow keys move the selection across a wrapped grid.
 */

/** Smallest / largest tile width, px — the slider's two ends. */
export const TILE_MIN = 96;
export const TILE_MAX = 420;
/** The tile width a first grid opens at. */
export const TILE_DEFAULT = 200;
/** Below this tile width the captions (name, size) are dropped. */
export const TILE_CAPTION_MIN = 140;

/** `px` held inside the slider's range, rounded to a whole pixel. */
export function clampTile(px: number): number {
  return Math.round(Math.max(TILE_MIN, Math.min(TILE_MAX, px)));
}

/** `+` / `−` in the grid: one step larger or smaller, proportional so the
 *  steps feel even at both ends of the range. */
export function stepTile(px: number, dir: 1 | -1): number {
  return clampTile(px * (dir > 0 ? 1.25 : 0.8));
}

/** A selection move in the grid. */
export type GridMove = "left" | "right" | "up" | "down";

/**
 * The index the selection moves to from `index` in a grid of `count` items laid
 * out `columns` wide. Left / right step one item (wrapping across rows, as
 * reading order does); up / down step a whole row. Never leaves `[0, count)`:
 * a move past either end stays on the first / last item.
 */
export function gridMove(
  index: number,
  move: GridMove,
  columns: number,
  count: number,
): number {
  if (count <= 0) return index;
  const cols = Math.max(1, Math.floor(columns));
  const delta =
    move === "left" ? -1 : move === "right" ? 1 : move === "up" ? -cols : cols;
  return Math.max(0, Math.min(count - 1, index + delta));
}
