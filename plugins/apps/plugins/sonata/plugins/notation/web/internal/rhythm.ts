/**
 * PURE adaptive-subdivision detector — the structural mechanism that replaces
 * the single fixed 1/16 grid with a **per-beat** subdivision decision, fixing
 * tuplets and sub-sixteenths in one stroke. Renderer-free and unit-tested.
 *
 * The old converter divided every bar into uniform {@link Q} cells; a triplet's
 * 1/3-beat onsets snapped to the nearest 16th (wrong onsets, no bracket) and a
 * 32nd collapsed to a 16th. This module looks at the *true* (unquantized) note
 * **onsets** in each quarter-note beat and decides, per beat, whether that beat
 * is binary (a 16th grid, dropping to a 32nd grid only when onsets demand it) or
 * a tuplet (eighth-triplet = 3, sixteenth-sextuplet = 6). The converter then
 * builds a **variable** cell grid from the returned plan.
 *
 * Onsets only — NOT offsets. A note's release is articulation-noise: staccato
 * and legato/gate release times land well off any grid, so voting offsets into
 * the subdivision decision mislabels ordinary rhythms as tuplets (a gated
 * 1.5-beat note releasing at 1.35 looks like a sextuplet division). Onsets are
 * the rhythmic signal; the note's *duration* is then quantized to the chosen
 * grid downstream, exactly as the old fixed-16th converter did.
 *
 * Two further biases keep it conservative:
 *  - The binary grid targets a **1/16-note real cell width** (the classic
 *    forgiving grid), so a normal beat behaves identically to the old converter
 *    and a partial trailing window stays ~16th too. It only goes to a 32nd grid
 *    when the onsets actually sit on 32nd positions.
 *  - A tuplet is chosen only when it *strictly* explains the onsets better than
 *    the binary grid can (by a margin), and only for a **full** beat window —
 *    so ordinary rhythms are never mislabeled triplets.
 */

/**
 * One quarter-note window of a bar with its chosen subdivision.
 *
 * `start`/`len` are in **real** quarter-note beats; `len` is `1.0` for a normal
 * window and shorter for the trailing partial window of an odd-length bar. The
 * window is divided into `cells` equal cells (cell width = `len / cells`). A
 * `tuplet` is present iff the window is a tuplet (binary windows omit it).
 */
export interface RhythmWindow {
  /** Absolute start beat of this window. */
  start: number;
  /** Length in real quarter-note beats (`1.0`, or less for a trailing partial). */
  len: number;
  /** Number of equal cells the window is divided into (the chosen subdivision). */
  cells: number;
  /**
   * Tuplet descriptor when this window is a tuplet. `num` = notes in the group
   * (3 or 6), `inSpace` = the power-of-two space they occupy (3→2, 6→4).
   */
  tuplet?: { num: number; inSpace: number };
}

/** Window length in real beats — the tuplet unit for the common cases. */
const WINDOW = 1.0;

/** Cells per whole beat at 1/16 real width — the default forgiving binary grid. */
const CELLS_PER_BEAT_16 = 4;

/** Cells per whole beat at 1/32 real width — used only when onsets demand it. */
const CELLS_PER_BEAT_32 = 8;

/** Tuplet subdivisions, coarsest first (eighth-triplet, sixteenth-sextuplet). */
const TUPLET = [3, 6] as const;

/**
 * Fit tolerance per event: a candidate grid `S` fits iff its total misfit is
 * `≤ TOL * (#events)`. Set just under 1/24 of a window so a 32nd onset (dead
 * centre of a 16th cell, misfit 0.125) can't masquerade as fitting the 16th
 * grid, while a genuine 32nd/16th grid still absorbs float jitter. (The design
 * doc's nominal 0.05 was too loose here — it let `{0,1/8,1/4}` pass the 16th
 * grid; 0.04 is the smallest round value that forces the 32nd.)
 */
const TOL = 0.04;

/**
 * Extra margin a tuplet must beat the binary fit by before it's chosen (scaled
 * by event count). Keeps ordinary near-binary rhythms from being mislabeled
 * tuplets: the tuplet has to *strictly* explain the onsets better, not merely
 * tie. (The doc's nominal 0.02 over-suppressed a *tight* triplet whose only
 * binary refuge is the very fine 32nd grid — its residual binary error is small
 * enough that a per-event 0.02 margin cancels the tuplet's clear win; 0.01
 * restores the intended "tuplet when it clearly reads better".)
 */
const MARGIN = 0.01;

/** Floating-point comparison slack. */
const EPS = 1e-6;

/** Largest power of two ≤ `n` (3→2, 6→4). */
function largestPow2AtMost(n: number): number {
  let p = 1;
  while (p * 2 <= n) p *= 2;
  return p;
}

/** Distance from `frac ∈ [0,1]` to its nearest grid line `k/S` (k = 0..S). */
function gridDist(frac: number, S: number): number {
  const k = Math.round(frac * S); // in 0..S since frac ∈ [0,1].
  return Math.abs(frac - k / S);
}

/** Total misfit of `fracs` against the `S`-cell grid: Σ nearest-line distance. */
function errFor(fracs: readonly number[], S: number): number {
  let sum = 0;
  for (const f of fracs) sum += gridDist(f, S);
  return sum;
}

/**
 * Plan a bar's windows from the in-voice note **onsets** (absolute beats; NOT
 * offsets — see the module header). Returns the ordered windows covering
 * `[barStart, barEnd)`, each carrying its chosen subdivision (and a `tuplet`
 * descriptor when tuplet).
 *
 * Pure — depends on nothing but its inputs.
 */
export function planWindows(
  onsets: readonly number[],
  barStart: number,
  barEnd: number,
): RhythmWindow[] {
  const windows: RhythmWindow[] = [];
  for (let wStart = barStart; wStart < barEnd - EPS; wStart += WINDOW) {
    const len = Math.min(WINDOW, barEnd - wStart);
    const wEnd = wStart + len;

    // Collect this window's onset fractions. An onset landing exactly on the
    // right edge belongs to the next window (frac 0 there), so use a half-open
    // [wStart, wEnd) test; the tiny EPS avoids double-counting a boundary onset.
    const fracs: number[] = [];
    for (const t of onsets) {
      if (t < wStart - EPS || t >= wEnd - EPS) continue;
      fracs.push(Math.min(1, Math.max(0, (t - wStart) / len)));
    }

    windows.push(decideWindow(wStart, len, fracs));
  }
  return windows;
}

/**
 * Decide one window's subdivision from its onset fractions.
 *
 * The binary grid targets a 1/16 real cell width (`S16`), dropping to a 1/32
 * grid (`S32`) only when the 16th grid can't place the onsets — so a normal beat
 * matches the old fixed-16th converter and a partial trailing window stays
 * ~16th. A tuplet is chosen only for a **full** beat window, and only when a
 * tuplet grid fits AND strictly beats the binary fit by `MARGIN` (so ordinary
 * rhythms are never mislabeled). An empty window is a plain 16th-grid cell run.
 */
function decideWindow(start: number, len: number, fracs: number[]): RhythmWindow {
  // Cell counts that give ~1/16 and ~1/32 REAL width across this window (so a
  // half-beat trailing window uses 2 / 4 cells, not 4 / 8).
  const S16 = Math.max(1, Math.round(len * CELLS_PER_BEAT_16));
  const S32 = Math.max(1, Math.round(len * CELLS_PER_BEAT_32));

  if (fracs.length === 0) return { start, len, cells: S16 };

  const fits = (S: number) => errFor(fracs, S) <= TOL * fracs.length + EPS;

  // 16th grid unless the onsets genuinely need 32nd resolution.
  const binGrid = fits(S16) ? S16 : S32;
  // The best binary explanation, for the tuplet-vs-binary margin comparison.
  const binErr = Math.min(errFor(fracs, S16), errFor(fracs, S32));

  // Tuplets occupy a full beat window; a partial trailing window stays binary.
  if (len >= WINDOW - EPS) {
    const tupS = TUPLET.find(fits);
    if (
      tupS !== undefined &&
      errFor(fracs, tupS) + MARGIN * fracs.length < binErr
    ) {
      return {
        start,
        len,
        cells: tupS,
        tuplet: { num: tupS, inSpace: largestPow2AtMost(tupS) },
      };
    }
  }
  return { start, len, cells: binGrid };
}
