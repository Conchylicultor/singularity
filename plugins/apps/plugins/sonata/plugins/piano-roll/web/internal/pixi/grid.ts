/**
 * Grid layers for the canvas piano roll: time-axis BAR LINES and pitch-axis
 * OCTAVE LINES — the canvas replacements for the DOM `GridLines`/`OctaveLines`
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
 *  - Octave lines mark a fixed pitch axis, so they are SCREEN-space (a direct
 *    stage child): vertical 1px lines at each C key's left-edge fraction ×
 *    laneWidth, full lane height. Redrawn on resize only (a handful of rects).
 *
 * Theme reactivity: both layers draw WHITE geometry and carry the resolved
 * `var(--border)` token as a TINT — `refreshColors` is then a tint write, no
 * retessellation. Alphas match the DOM classes: `border-border/60` for bars,
 * `border-border/40` for octaves.
 */
import { Graphics } from "pixi.js";
import { PX_PER_SECOND } from "../../components/geometry";

/** One bar marker, in authored seconds (built by the host from `bars(score)`). */
export interface BarMarker {
  index: number;
  startSec: number;
}

/** CSS expression for the grid line color — the DOM version's `border-border`. */
const BORDER_COLOR_EXPR = "var(--border)";
const BAR_LINE_ALPHA = 0.6;
const OCTAVE_LINE_ALPHA = 0.4;

export interface GridHandle {
  /** Bar lines — mount under the CONTENT-SCALED container. */
  barLines: Graphics;
  /** Octave lines — mount directly on the stage (screen space, below notes). */
  octaveLines: Graphics;
  /** Rebuild the bar lines (once per score). */
  setBars(bars: readonly BarMarker[]): void;
  /** Set the C-boundary fractions (once per score). */
  setBoundaries(cBoundaryFracs: readonly number[]): void;
  /** Redraw the screen-space octave lines for a new lane size. */
  resize(laneWidth: number, laneHeight: number): void;
  /** Re-tint both layers from the (re-resolved) border token. */
  refreshColors(resolveColor: (expr: string) => number): void;
  destroy(): void;
}

export function createGrid(): GridHandle {
  const barLines = new Graphics();
  barLines.alpha = BAR_LINE_ALPHA;
  const octaveLines = new Graphics();
  octaveLines.alpha = OCTAVE_LINE_ALPHA;

  let fracs: readonly number[] = [];
  let laneWidth = 0;
  let laneHeight = 0;

  const redrawOctaves = (): void => {
    octaveLines.clear();
    if (laneWidth <= 0 || laneHeight <= 0) return;
    for (const frac of fracs) {
      // 1px vertical line whose LEFT edge sits on the C key's left edge —
      // matching the DOM's `border-l` at `left: center - width/2`.
      octaveLines.rect(frac * laneWidth, 0, 1, laneHeight).fill(0xffffff);
    }
  };

  return {
    barLines,
    octaveLines,

    setBars(bars) {
      barLines.clear();
      for (const b of bars) {
        // The DOM drew `border-t` at the bar's content Y, extending 1px DOWN
        // (toward earlier time). y = -startSec, height = 1px after the
        // constant scale.y = PX_PER_SECOND.
        barLines.rect(0, -b.startSec, 1, 1 / PX_PER_SECOND).fill(0xffffff);
      }
    },

    setBoundaries(cBoundaryFracs) {
      fracs = cBoundaryFracs;
      redrawOctaves();
    },

    resize(width, height) {
      laneWidth = width;
      laneHeight = height;
      redrawOctaves();
    },

    refreshColors(resolveColor) {
      const border = resolveColor(BORDER_COLOR_EXPR);
      barLines.tint = border;
      octaveLines.tint = border;
    },

    destroy() {
      barLines.destroy();
      octaveLines.destroy();
    },
  };
}
