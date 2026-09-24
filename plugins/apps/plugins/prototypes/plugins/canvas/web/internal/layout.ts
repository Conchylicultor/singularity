import {
  SIZE_PRESETS,
  presetSize,
  type PresetName,
} from "@plugins/apps/plugins/prototypes/plugins/files/core";
import type { CanvasSize, CanvasZoom } from "./canvas-model";

/**
 * How big every frame is, and at what scale — from three independent settings:
 *
 * - size: the frame's logical size — a device preset, a custom width, This
 *   window (the size a page gets in the viewer's own browser window), or
 *   Responsive (the frame IS the space the canvas has, measured in page pixels
 *   at this zoom);
 * - zoom: Fit (the whole frame visible at once) or a fixed scale;
 * - whole page: show each page's entire content instead of one screen of it.
 *
 * Pure. The canvas measures the room one frame has and the pages' heights; this
 * turns them into numbers.
 */

/** The board's padding and the gaps between frames, in px (inline geometry). */
export const BOARD_PAD = { top: 24, x: 32, bottom: 32 } as const;
export const FRAME_GAP = 24;
/** A frame's header row, plus the gap under it. */
export const FRAME_HEAD = 34;

/** Dragged widths stay in this range. */
export const MIN_WIDTH = 360;
export const MAX_WIDTH = 2560;
/** A dragged width this close to a preset's snaps onto it. */
export const SNAP_PX = 28;

/** The zoom slider's range, as scales. */
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 2;

export interface Room {
  w: number;
  h: number;
}

/**
 * The space ONE of `n` frames has on a canvas whose scroll viewport is `canvas`:
 * the board padding, the gaps and each frame's header taken out.
 */
export function roomPerFrame(canvas: Room, n: number): Room {
  const count = Math.max(1, n);
  return {
    w: Math.max(
      1,
      (canvas.w - 2 * BOARD_PAD.x - FRAME_GAP * (count - 1)) / count,
    ),
    h: Math.max(1, canvas.h - BOARD_PAD.top - BOARD_PAD.bottom - FRAME_HEAD),
  };
}

export interface FrameLayout {
  /** The logical frame size, in page pixels: what the page lays out at. */
  width: number;
  height: number;
  /**
   * How much of the page is visible: `height`, or with Whole page on, the
   * tallest page — never less than `height`.
   */
  visibleHeight: number;
  /** On-screen px per page px. */
  scale: number;
}

/**
 * Lay out the frames (they all share one size).
 *
 * `pageHeight` is the tallest page's full height, when Whole page is on and it
 * has been measured; `null` otherwise. `browserWindow` is the size a page gets
 * in this browser window (`useWindowSize`), which the This window size is.
 */
export function layoutFrames({
  room,
  size,
  browserWindow,
  zoom,
  wholePage,
  pageHeight,
}: {
  room: Room;
  size: CanvasSize;
  browserWindow: Room;
  zoom: CanvasZoom;
  wholePage: boolean;
  pageHeight: number | null;
}): FrameLayout {
  const fit = zoom === "fit";
  if (size.kind === "responsive") {
    // The viewport IS the available space, measured in page pixels at this
    // zoom. At Fit that is scale 1 — or, with Whole page on, the scale at which
    // the whole page fits the room's height.
    const page = wholePage ? pageHeight : null;
    const scale = fit
      ? page === null
        ? 1
        : Math.min(1, room.h / Math.max(page, 1))
      : zoom;
    const width = Math.round(room.w / scale);
    const height = Math.round(room.h / scale);
    return {
      width,
      height,
      visibleHeight: visible(height, wholePage, pageHeight),
      scale,
    };
  }
  const { w, h } =
    size.kind === "preset"
      ? presetSize(size.preset)
      : size.kind === "window"
        ? browserWindow
        : size;
  const visibleHeight = visible(h, wholePage, pageHeight);
  const scale = fit ? Math.min(room.w / w, room.h / visibleHeight) : zoom;
  return { width: w, height: h, visibleHeight, scale };
}

function visible(
  height: number,
  wholePage: boolean,
  pageHeight: number | null,
): number {
  return wholePage && pageHeight !== null
    ? Math.max(height, pageHeight)
    : height;
}

/**
 * A width dragged off a frame's edge: clamped to the drag range, and snapped
 * onto a preset it lands within {@link SNAP_PX} of.
 */
export function snapWidth(w: number): {
  width: number;
  preset: PresetName | null;
} {
  const clamped = Math.round(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, w)));
  const snap = SIZE_PRESETS.find((p) => Math.abs(p.w - clamped) < SNAP_PX);
  return snap
    ? { width: snap.w, preset: snap.name }
    : { width: clamped, preset: null };
}

/** The size a drag to `w` lands on, keeping `height` unless it snaps. */
export function sizeForDrag(w: number, height: number): CanvasSize {
  const { width, preset } = snapWidth(w);
  return preset !== null
    ? { kind: "preset", preset }
    : { kind: "custom", w: width, h: height };
}

/** What the size chip names the size ("Responsive", "This window", "Phone", "Custom"). */
export function sizeName(size: CanvasSize): string {
  switch (size.kind) {
    case "responsive":
      return "Responsive";
    case "window":
      return "This window";
    case "preset":
      return size.preset;
    case "custom":
      return "Custom";
  }
}

/** A zoom percentage as a clamped scale. */
export function zoomFromPercent(percent: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, percent / 100));
}
