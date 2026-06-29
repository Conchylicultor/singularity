/**
 * A–B practice-loop time window, in **score-seconds** (the `beatToSeconds`
 * domain). `startSec`/`endSec` are the loop bounds A/B converted through the
 * tempo index; folding works in seconds so a varying tempo map inside the loop
 * is handled for free (the seconds duration of each iteration is exact).
 */
export interface LoopWindowSec {
  startSec: number;
  endSec: number;
}

/**
 * Fold a monotonic elapsed score-time (seconds, increasing forever) into an A–B
 * loop window — the deterministic core of the seamless loop. The transport
 * anchors **once** (at play / seek / tempo change) and every later wrap is
 * *computed* here rather than triggered by a teardown, so the cursor (and the
 * audio scheduler, which mirrors this fold in its own cumulative-time form) wrap
 * with zero re-sync.
 *
 * Returns the folded position in score-seconds and a zero-based `iter` count:
 * `0` is the first pass up to the first wrap, `1` the next iteration, and so on.
 * The first pass runs from wherever playback started up to `endSec` (so a start
 * before A still plays straight through into the loop, matching the old wrap
 * condition), then every iteration cycles `[startSec, endSec)`.
 *
 * With no window (or a degenerate one) this is the identity at `iter 0`.
 */
export function foldLoopTime(
  rawSec: number,
  win: LoopWindowSec | null,
): { sec: number; iter: number } {
  if (!win) return { sec: rawSec, iter: 0 };
  const len = win.endSec - win.startSec;
  if (len <= 0 || rawSec < win.endSec) return { sec: rawSec, iter: 0 };
  const over = rawSec - win.endSec;
  const iter = 1 + Math.floor(over / len);
  return { sec: win.startSec + (over - (iter - 1) * len), iter };
}
