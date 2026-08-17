/**
 * Does a laid-out row fit the box it was given?
 *
 * Pure, like the rest of `core/` — the DOM half reads the rects, this decides
 * what they mean, and the decision is exercisable without a layout engine.
 */

/** A horizontal extent. Both edges in the same coordinate space. */
export interface Span {
  left: number;
  right: number;
}

/**
 * How far `content` sticks out of `box`, on **either** side — 0 when it fits.
 *
 * Both sides matter and that is the whole point of the function existing.
 * `align="end"` packs the occupants against the far edge, so a row with too
 * much in it overflows to the **left**, and every right-edge-only test is blind
 * to it. That is not a corner case: `align="end"` is what every pane header
 * uses. (Nor can `scrollWidth` stand in — LTR scrollable overflow does not
 * account for content past the left edge at all, so it reads exactly equal to
 * `clientWidth` on a row overflowing by 16px. Measured, not assumed.)
 *
 * Empty `content` is 0, not an overflow: a row with nothing laid out in it
 * cannot fail to contain nothing.
 *
 * `tolerancePx` absorbs sub-pixel rounding; the caller passes the same 1px the
 * fit math uses.
 */
export function overflowPx(
  box: Span,
  content: readonly Span[],
  tolerancePx = 1,
): number {
  if (content.length === 0) return 0;
  let minLeft = Infinity;
  let maxRight = -Infinity;
  for (const span of content) {
    if (span.left < minLeft) minLeft = span.left;
    if (span.right > maxRight) maxRight = span.right;
  }
  return Math.max(
    0,
    box.left - minLeft - tolerancePx,
    maxRight - box.right - tolerancePx,
  );
}
