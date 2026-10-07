/**
 * The playback rate to ask a player for, given the `requested` one, the rate it
 * plays at now and the rates it `available`-ly supports: the nearest supported
 * rate — except that a request off the current rate always moves at least one
 * supported step toward it. A small nudge (1 → 1.05) or a slow drag would
 * otherwise round back to the current rate forever, and the speed could never
 * change in steps smaller than half the gap between two supported rates.
 */
export function snapPlaybackRate(
  requested: number,
  current: number,
  available: readonly number[],
): number {
  if (available.length === 0) {
    throw new Error("snapPlaybackRate: the player supports no playback rate");
  }
  const rates = [...available].sort((a, b) => a - b);
  const nearest = rates.reduce((best, r) =>
    Math.abs(r - requested) < Math.abs(best - requested) ? r : best,
  );
  if (nearest !== current || requested === current) return nearest;
  const step =
    requested > current
      ? rates.find((r) => r > current)
      : rates.findLast((r) => r < current);
  return step ?? current;
}
