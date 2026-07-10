// Closed-interval overlap of an event [startMs, endMs] with the requested
// window [fromMs, toMs] — all wall-clock epoch ms. Touching edges count as
// overlap (a point event exactly at a window edge is included). Events are NOT
// clamped: an event may extend past the window edges; clamping is a rendering
// concern (the web layer clips bars to the axis).
export function overlapsWindow(
  startMs: number,
  endMs: number,
  fromMs: number,
  toMs: number,
): boolean {
  return startMs <= toMs && endMs >= fromMs;
}
