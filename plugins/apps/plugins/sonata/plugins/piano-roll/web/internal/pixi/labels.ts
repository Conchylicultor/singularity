/**
 * Text layers for the canvas piano roll: Synthesia-style NOTE-NAME labels and
 * BAR NUMBERS — the canvas replacement for the DOM `<span>` labels that lived
 * inside each note div and the bar-number spans inside `GridLines`.
 *
 * Both live in the PIXEL-SPACE scroll container (`pixelScroll` in the scene):
 * it shares the content layers' per-frame translateY but has NO content scale,
 * so glyphs never distort under the lane's non-uniform (width × time) scale.
 * Positions are therefore authored as `y = -seconds × PX_PER_SECOND` pixels.
 *
 * Note labels are POOLED + WINDOWED: a score can carry thousands of notes but
 * only ~30–150 onsets are on screen at once. `createLabelWindow` binary-searches
 * the notes-sorted-by-onset array for the visible onset range; pooled
 * BitmapText instances are acquired/released as the window slides. A hard cap
 * (largest-fontPx-first, i.e. most-legible-first) bounds the worst case —
 * a simple priority that's deliberately v1 (no spatial de-clutter).
 *
 * ACCIDENTAL APPROACH (documented decision): the DOM rendered the accidental
 * as a nested span at 0.7em, tucked -0.12em into the letter. We mirror that
 * with TWO BitmapTexts per pooled label (step + accidental) laid out manually
 * from measured widths — chosen over a single concatenated string because the
 * full-size unicode ♯/♭ advance would overflow the narrow black-key columns
 * that `noteLabelFontPx`'s accidental budget was tuned for.
 *
 * Fonts are runtime-installed BitmapFonts (glyphs rasterized once, then every
 * label is a couple of quads): one white Inter-600 face with the DOM label's
 * dark halo baked in as a drop shadow, and a shadowless face for bar numbers
 * (tinted to the muted-foreground token).
 */
import { BitmapFont, BitmapText, Container } from "pixi.js";
import { PX_PER_SECOND, type NoteVisual } from "../../components/geometry";
import type { BarMarker } from "./grid";

// --- pure sizing / windowing (unit-tested, no Pixi/DOM needed at runtime) ------

/**
 * Font size (px) for a falling-bar note name, sized so the whole label fits
 * *inside* the bar — no overflow into neighbouring columns. The width budget is
 * the label's intrinsic advance in em: one cap letter (≈0.70em in Inter
 * semibold) plus, when present, the compact accidental rendered at 0.7em and
 * tucked in (net ≈0.34em). Dividing the bar width by that budget makes a bare
 * natural on a wide white key large, while a flat/sharp on the narrower black
 * key (blackW ≈ 0.62·whiteW) plus its extra glyph comes out smaller — exactly
 * the desired "black-key names are smaller" behaviour. Capped by the bar height
 * so short notes don't get oversized text, and by a tasteful ceiling. Returns
 * null when even the legible floor won't fit, so the caller skips the label.
 */
export function noteLabelFontPx(
  keyWidth: number,
  barHeight: number,
  hasAccidental: boolean,
): number | null {
  const FLOOR = 7;
  const LETTER_EM = 0.7;
  const ACCIDENTAL_EM = 0.34;
  const FILL = 0.94;
  const emWidth = LETTER_EM + (hasAccidental ? ACCIDENTAL_EM : 0);
  const widthFit = (keyWidth * FILL) / emWidth;
  if (widthFit < FLOOR) return null;
  return Math.max(FLOOR, Math.min(widthFit, barHeight * 0.85, 28));
}

/**
 * Windowing helper: given notes SORTED ASCENDING by onset (`y0Sec`), returns a
 * query for the half-open index range `[start, end)` of notes whose onset lies
 * in `[minSec, maxSec]` — two binary searches, O(log n) per frame. Pure.
 */
export function createLabelWindow(
  notesSortedByOnset: readonly { y0Sec: number }[],
): (minSec: number, maxSec: number) => { start: number; end: number } {
  const notes = notesSortedByOnset;
  /** First index whose onset satisfies `predicate threshold` semantics. */
  const lowerBound = (sec: number): number => {
    // First idx with y0Sec >= sec.
    let lo = 0;
    let hi = notes.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (notes[mid]!.y0Sec < sec) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  const upperBound = (sec: number): number => {
    // First idx with y0Sec > sec.
    let lo = 0;
    let hi = notes.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (notes[mid]!.y0Sec <= sec) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  return (minSec, maxSec) => ({
    start: lowerBound(minSec),
    end: upperBound(maxSec),
  });
}

// --- bitmap fonts ---------------------------------------------------------------

const LABEL_FONT = "piano-roll-note-label";
const BAR_FONT = "piano-roll-bar-number";

/** Hard cap on live note labels. Sliced largest-fontPx-first so when the
 *  window is overfull the most legible labels win (simple v1 priority). */
const MAX_LIVE_LABELS = 300;

/** Bar numbers: the DOM used `text-3xs` (0.625rem) `muted-foreground/70`. */
const BAR_FONT_PX = 10;
const BAR_NUMBER_ALPHA = 0.7;
const MUTED_FOREGROUND_EXPR = "var(--muted-foreground)";

let fontsInstalled = false;

/**
 * Install both bitmap faces once per page (BitmapFont registries are global;
 * a second install with the same name would throw). Rasterized at 2× a 32px
 * base so the 7–28px labels stay crisp on hiDPI.
 */
function ensureFonts(): void {
  if (fontsInstalled) return;
  fontsInstalled = true;
  BitmapFont.install({
    name: LABEL_FONT,
    style: {
      fontFamily: "Inter, sans-serif",
      fontWeight: "600",
      fontSize: 32,
      fill: 0xffffff,
      // The DOM label's halo (`text-shadow: 0 1px 1.5px rgba(0,0,0,.95), …`):
      // keeps a white glyph legible on every palette hue without per-note
      // luminance math.
      dropShadow: {
        color: 0x000000,
        alpha: 0.9,
        blur: 1.5,
        distance: 1,
        angle: Math.PI / 2,
      },
    },
    // A–G note letters, digits (bar numbers share glyph logic in tests; also
    // future octave suffixes), the music accidentals — and ASCII #/b as a
    // safety net should a speller ever emit them un-prettified.
    chars: [["A", "G"], ["0", "9"], "♭♯#b"],
    resolution: 2,
  });
  BitmapFont.install({
    name: BAR_FONT,
    style: {
      fontFamily: "Inter, sans-serif",
      fontWeight: "400",
      fontSize: 32,
      fill: 0xffffff, // white face; the live tint carries the muted token
    },
    chars: [["0", "9"]],
    resolution: 2,
  });
}

// --- pooled, windowed label layer -------------------------------------------------

/** One pooled label: a step letter plus an optional tucked accidental. */
interface PooledLabel {
  root: Container;
  step: BitmapText;
  accidental: BitmapText;
}

interface LabelEntry {
  v: NoteVisual;
  step: string;
  accidental: string;
}

export interface LabelLayerHandle {
  /** Note-name labels — mount under the PIXEL-SPACE scroll container. */
  noteLabels: Container;
  /** Bar numbers — mount under the PIXEL-SPACE scroll container. */
  barNumbers: Container;
  setNotes(visuals: readonly NoteVisual[]): void;
  setBars(bars: readonly BarMarker[]): void;
  /** New lane size: re-derives every live label's font size and x position. */
  setLaneSize(width: number, height: number): void;
  setVisible(on: boolean): void;
  /** Per-frame: slide the label window to the current scroll position. */
  update(scrollSec: number): void;
  refreshColors(resolveColor: (expr: string) => number): void;
  destroy(): void;
}

/** Extra onset range kept live beyond the visible lane, so labels at the
 *  edges don't pop as they cross in/out (~32px worth of seconds). */
const WINDOW_PAD_SEC = 32 / PX_PER_SECOND;

export function createLabelLayer(): LabelLayerHandle {
  ensureFonts();

  const noteLabels = new Container();
  const barNumbers = new Container();
  const barTexts: BitmapText[] = [];

  // Notes sorted by onset (the windowing order) + the matching window query.
  let entries: LabelEntry[] = [];
  let windowOf: (min: number, max: number) => { start: number; end: number } =
    () => ({ start: 0, end: 0 });

  let laneWidth = 0;
  let laneHeight = 0;
  let lastScrollSec = 0;
  let dirty = true; // forces the next update() to re-place everything

  // Pool: live labels keyed by entry index, plus a free list.
  const active = new Map<number, PooledLabel>();
  const free: PooledLabel[] = [];

  const acquire = (): PooledLabel => {
    const pooled = free.pop();
    if (pooled) {
      pooled.root.visible = true;
      return pooled;
    }
    const root = new Container();
    const step = new BitmapText({
      text: "",
      style: { fontFamily: LABEL_FONT, fontSize: 16 },
      anchor: { x: 0, y: 1 },
    });
    const accidental = new BitmapText({
      text: "",
      style: { fontFamily: LABEL_FONT, fontSize: 12 },
      anchor: { x: 0, y: 1 },
    });
    root.addChild(step, accidental);
    noteLabels.addChild(root);
    return { root, step, accidental };
  };

  const release = (pooled: PooledLabel): void => {
    pooled.root.visible = false;
    free.push(pooled);
  };

  /**
   * Place one label exactly where the DOM put it. The DOM note div spanned
   * top = -y1·px with height h-1, so its bottom edge sat at -y0·px - 1; the
   * label span was inset a further 2px (`bottom-0.5`) ⇒ label BOTTOM at
   * -y0·px - 3, centered on the key column. The accidental renders at 0.7×
   * the letter size and is tucked -0.12em (of its own size) into the letter,
   * matching the DOM's negative margin.
   */
  const place = (pooled: PooledLabel, e: LabelEntry, fontPx: number): void => {
    const { root, step, accidental } = pooled;
    step.style.fontSize = fontPx;
    step.text = e.step;
    const stepW = step.width;
    let totalW = stepW;
    if (e.accidental !== "") {
      const accPx = fontPx * 0.7;
      const tuck = accPx * 0.12;
      accidental.visible = true;
      accidental.style.fontSize = accPx;
      accidental.text = e.accidental;
      const accW = accidental.width;
      totalW = stepW + accW - tuck;
      step.x = -totalW / 2;
      accidental.x = step.x + stepW - tuck;
      accidental.y = 0;
    } else {
      accidental.visible = false;
      step.x = -stepW / 2;
    }
    step.y = 0;
    root.x = (e.v.xFrac + e.v.wFrac / 2) * laneWidth;
    root.y = -e.v.y0Sec * PX_PER_SECOND - 3;
  };

  let lastStart = 0;
  let lastEnd = 0;

  const refreshWindow = (scrollSec: number): void => {
    lastScrollSec = scrollSec;
    if (!noteLabels.visible || laneHeight <= 0 || laneWidth <= 0) return;
    // Visible authored-seconds range: lane bottom is the cursor (scrollSec),
    // lane top is laneHeight px further into the future.
    const minSec = scrollSec - WINDOW_PAD_SEC;
    const maxSec = scrollSec + laneHeight / PX_PER_SECOND + WINDOW_PAD_SEC;
    const { start, end } = windowOf(minSec, maxSec);
    if (!dirty && start === lastStart && end === lastEnd) return;
    lastStart = start;
    lastEnd = end;
    dirty = false;

    // Candidates: windowed entries whose label legibly fits, capped at
    // MAX_LIVE_LABELS keeping the LARGEST fonts (most legible first).
    let candidates: { idx: number; fontPx: number }[] = [];
    for (let idx = start; idx < end; idx++) {
      const e = entries[idx]!;
      const fontPx = noteLabelFontPx(
        e.v.wFrac * laneWidth,
        (e.v.y1Sec - e.v.y0Sec) * PX_PER_SECOND,
        e.accidental !== "",
      );
      if (fontPx !== null) candidates.push({ idx, fontPx });
    }
    if (candidates.length > MAX_LIVE_LABELS) {
      candidates = candidates
        .sort((a, b) => b.fontPx - a.fontPx)
        .slice(0, MAX_LIVE_LABELS);
    }

    const keep = new Map(candidates.map((c) => [c.idx, c.fontPx]));
    for (const [idx, pooled] of active) {
      if (!keep.has(idx)) {
        release(pooled);
        active.delete(idx);
      }
    }
    for (const { idx, fontPx } of candidates) {
      let pooled = active.get(idx);
      if (!pooled) {
        pooled = acquire();
        active.set(idx, pooled);
      }
      // Re-place unconditionally: cheap (couple of glyphs), and it keeps the
      // resize path trivially correct (laneWidth changed ⇒ dirty ⇒ full pass).
      place(pooled, entries[idx]!, fontPx);
    }
  };

  return {
    noteLabels,
    barNumbers,

    setNotes(visuals) {
      // Keep only labeled notes, sorted by onset for the binary-search window.
      entries = visuals
        .filter((v) => v.label !== null)
        .map((v) => ({ v, step: v.label!.step, accidental: v.label!.accidental }))
        .sort((a, b) => a.v.y0Sec - b.v.y0Sec);
      windowOf = createLabelWindow(entries.map((e) => e.v));
      // Window indices refer to a new array — drop every live label.
      for (const pooled of active.values()) release(pooled);
      active.clear();
      dirty = true;
      refreshWindow(lastScrollSec);
    },

    setBars(bars) {
      for (const t of barTexts) t.destroy();
      barTexts.length = 0;
      for (const b of bars) {
        const text = new BitmapText({
          text: String(b.index + 1),
          style: { fontFamily: BAR_FONT, fontSize: BAR_FONT_PX },
          // The DOM span sat `left-1 top-0.5` under the bar line.
          x: 4,
          y: -b.startSec * PX_PER_SECOND + 2,
          alpha: BAR_NUMBER_ALPHA,
        });
        barTexts.push(text);
        barNumbers.addChild(text);
      }
    },

    setLaneSize(width, height) {
      if (width === laneWidth && height === laneHeight) return;
      laneWidth = width;
      laneHeight = height;
      dirty = true;
      refreshWindow(lastScrollSec);
    },

    setVisible(on) {
      if (noteLabels.visible === on) return;
      noteLabels.visible = on;
      if (on) {
        dirty = true;
        refreshWindow(lastScrollSec);
      }
    },

    update(scrollSec) {
      refreshWindow(scrollSec);
    },

    refreshColors(resolveColor) {
      // Note labels are pure white + baked halo — theme-invariant by design
      // (same as the DOM). Only the bar numbers carry a theme token.
      const muted = resolveColor(MUTED_FOREGROUND_EXPR);
      for (const t of barTexts) t.tint = muted;
    },

    destroy() {
      noteLabels.destroy({ children: true });
      barNumbers.destroy({ children: true });
      // Pooled-but-detached labels were children of noteLabels, so they are
      // covered by the recursive destroy above.
      active.clear();
      free.length = 0;
    },
  };
}
