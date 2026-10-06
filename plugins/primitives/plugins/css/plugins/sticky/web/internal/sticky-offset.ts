/**
 * A measured height, made safe to pin the next sticky box at.
 *
 * A stacked sticky box pins at the measured height of what it sits under, so
 * the offset must be the EXACT height: rounding 29.5px to 30 pins the next box
 * half a pixel low, and the content scrolling behind shows through that
 * one-device-pixel strip as a dotted line between the two bands. Rounding was
 * only ever there so sub-pixel `getBoundingClientRect` jitter cannot re-render
 * whoever stores the value — snapping to the layout engine's own unit (1/64 px,
 * the granularity box geometry is stored in) gives that stability with no
 * error, since a real box height is already a multiple of it.
 */
export function stickyOffsetPx(height: number): number {
  return Math.round(height * 64) / 64;
}
