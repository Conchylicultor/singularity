/**
 * Grid layers for the canvas piano roll: time-axis BAR LINES and pitch-axis
 * PITCH LINES — the canvas replacements for the DOM `GridLines`/`OctaveLines`
 * components.
 *
 * Two different spaces, mirroring the DOM version's layering:
 *
 *  - Bar lines scroll with the notes, so they live in CONTENT space (authored
 *    units: x in 0..1 key-fractions, y = -seconds) under the content-scaled
 *    container. A line is a filled rect of height 1/PX_PER_SECOND seconds —
 *    scale.y is the constant PX_PER_SECOND, so it renders exactly 1px at any
 *    lane size. Built ONCE per score; resize never redraws it.
 *
 *  - Pitch lines mark a fixed pitch axis, so they are SCREEN-space (a direct
 *    stage child): vertical 1px lines at the natural white-key boundaries
 *    (B–C octave splits, plus the E–F mid-octave split), at each boundary key's
 *    left-edge fraction × laneWidth, full lane height. Octave (B–C) lines render
 *    stronger than the mid-octave (E–F) lines. Redrawn on resize only.
 *
 * Color: both layers draw WHITE geometry and carry a FIXED faint-light tint —
 * the lane is a Synthesia-dark stage in every theme (see `ROLL_BG`), so the grid
 * is a theme-independent low-alpha white, not the `var(--border)` token (which
 * would vanish on the dark lane under a dark theme). `refreshColors` is still a
 * tint write (no retessellation).
 */
import { Graphics } from "pixi.js";
import { PX_PER_SECOND } from "../../components/geometry";

/** One bar marker, in authored seconds (built by the host from `bars(score)`). */
export interface BarMarker {
  index: number;
  startSec: number;
}

/**
 * A vertical pitch-axis grid line at a natural white-key boundary.
 * `strong` marks the octave (B–C) splits, which render heavier than the
 * mid-octave (E–F) splits.
 */
export interface PitchLine {
  /** Left-edge fraction (0..1) of the boundary key. */
  frac: number;
  strong: boolean;
}

/** Fixed faint-white grid color on the Synthesia-dark lane (theme-independent). */
const BORDER_COLOR_EXPR = "#ffffff";
const BAR_LINE_ALPHA = 0.1;
/** Octave (B–C) pitch line alpha — the strong reference line. */
const OCTAVE_LINE_ALPHA = 0.24;
/** Mid-octave (E–F) pitch line alpha — a regular, lighter reference line. */
const PITCH_LINE_ALPHA = 0.09;

export interface GridHandle {
  /** Bar lines — mount under the CONTENT-SCALED container. */
  barLines: Graphics;
  /** Pitch lines — mount directly on the stage (screen space, below notes). */
  pitchLines: Graphics;
  /** Rebuild the bar lines (once per score). */
  setBars(bars: readonly BarMarker[]): void;
  /** Set the pitch-axis boundary lines (once per score). */
  setPitchLines(lines: readonly PitchLine[]): void;
  /** New vertical zoom: redraw the bar lines so each stays 1px tall under the
   *  content scale.y = PX_PER_SECOND * spread. O(bars). */
  setSpread(spread: number): void;
  /** Redraw the screen-space pitch lines for a new lane size. */
  resize(laneWidth: number, laneHeight: number): void;
  /** Re-tint both layers from the (re-resolved) border token. */
  refreshColors(resolveColor: (expr: string) => number): void;
  destroy(): void;
}

export function createGrid(): GridHandle {
  const barLines = new Graphics();
  barLines.alpha = BAR_LINE_ALPHA;
  // Per-line alpha is baked into each fill (octave vs mid-octave), so the
  // container stays at full opacity and only carries the shared tint.
  const pitchLines = new Graphics();

  let lines: readonly PitchLine[] = [];
  let laneWidth = 0;
  let laneHeight = 0;
  // Bars + zoom retained so a spread change can redraw bar lines at the right
  // (zoom-compensated) authored-seconds height without a fresh score.
  let lastBars: readonly BarMarker[] = [];
  let spread = 1;

  const redrawBars = (): void => {
    barLines.clear();
    for (const b of lastBars) {
      // The DOM drew `border-t` at the bar's content Y, extending 1px DOWN
      // (toward earlier time). y = -startSec; height = 1px after the content
      // scale.y = PX_PER_SECOND * spread, so the authored-seconds height is
      // 1 / (PX_PER_SECOND * spread) to stay exactly 1px at any zoom.
      barLines.rect(0, -b.startSec, 1, 1 / (PX_PER_SECOND * spread)).fill(0xffffff);
    }
  };

  const redrawPitchLines = (): void => {
    pitchLines.clear();
    if (laneWidth <= 0 || laneHeight <= 0) return;
    for (const { frac, strong } of lines) {
      // 1px vertical line whose LEFT edge sits on the boundary key's left edge —
      // matching the DOM's `border-l` at `left: center - width/2`.
      pitchLines
        .rect(frac * laneWidth, 0, 1, laneHeight)
        .fill({ color: 0xffffff, alpha: strong ? OCTAVE_LINE_ALPHA : PITCH_LINE_ALPHA });
    }
  };

  return {
    barLines,
    pitchLines,

    setBars(bars) {
      lastBars = bars;
      redrawBars();
    },

    setPitchLines(pitchBoundaries) {
      lines = pitchBoundaries;
      redrawPitchLines();
    },

    setSpread(nextSpread) {
      spread = nextSpread;
      redrawBars();
    },

    resize(width, height) {
      laneWidth = width;
      laneHeight = height;
      redrawPitchLines();
    },

    refreshColors(resolveColor) {
      const border = resolveColor(BORDER_COLOR_EXPR);
      barLines.tint = border;
      pitchLines.tint = border;
    },

    destroy() {
      barLines.destroy();
      pitchLines.destroy();
    },
  };
}
