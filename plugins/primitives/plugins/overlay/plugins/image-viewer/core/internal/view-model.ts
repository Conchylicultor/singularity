/**
 * The image viewer's geometry, as pure functions.
 *
 * Everything is in STAGE coordinates: the stage is the full-window box the
 * image is drawn on, `(0, 0)` its top-left corner. The image is placed at the
 * stage's top-left with `transform-origin: 0 0`, so a {@link View} is exactly
 * the transform written onto it: `translate(x, y) scale(scale)`.
 *
 * The floating controls (top bar, bottom toolbar, side arrows) cover parts of
 * the stage, so every function works against an {@link Area} — the stage size
 * plus how far in from each edge the image must stay to be fully visible. "Fit"
 * means fit inside that area, never behind a control.
 */

export interface Size {
  readonly width: number;
  readonly height: number;
}

/** Where the image is drawn: its top-left corner on the stage, and its scale. */
export interface View {
  readonly scale: number;
  readonly x: number;
  readonly y: number;
}

/** The stage size, and the insets the floating controls take from each edge. */
export interface Area {
  readonly width: number;
  readonly height: number;
  readonly top: number;
  readonly bottom: number;
  /** Left and right alike — the side arrows are symmetric. */
  readonly side: number;
}

/** A box on the stage, in stage pixels. */
export interface Rect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** The largest zoom, as a multiple of the image's real size. */
export const MAX_SCALE = 16;

/** The smallest scale fit may reach, so a stage too small to hold any image
 *  still yields a drawable, invertible transform. */
const MIN_SCALE = 0.01;

/** The fixed zoom levels `+` / `−` step through. Fit is slotted in between by
 *  {@link stepScale}, never listed here: it depends on the image. */
export const ZOOM_LADDER: readonly number[] = [
  0.05, 0.1, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.5, 2, 3, 4, 6, 8, 12, 16,
];

/** Below this stage width the viewer drops to its compact layout. */
export const COMPACT_BELOW = 620;

/** How far the image stays from each edge, clear of the controls. */
const INSETS = {
  top: 64,
  bottom: 76,
  side: 32,
  /** The side arrows are showing: keep the image out from under them. */
  sideWithArrows: 76,
  compactSide: 12,
} as const;

/** Two scales closer than this are the same zoom (floating-point slack). */
const EPS = 1e-3;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** The area for a stage of `stage` size. `navigable` = the side arrows show. */
export function viewerArea(stage: Size, opts: { navigable: boolean }): Area {
  const side =
    stage.width < COMPACT_BELOW
      ? INSETS.compactSide
      : opts.navigable
        ? INSETS.sideWithArrows
        : INSETS.side;
  return {
    width: stage.width,
    height: stage.height,
    top: INSETS.top,
    bottom: INSETS.bottom,
    side,
  };
}

/** The room inside the controls. */
function room(area: Area): Size {
  return {
    width: area.width - 2 * area.side,
    height: area.height - area.top - area.bottom,
  };
}

/** The scale that fits the whole image inside the area. Never above 1: fit
 *  shrinks a large image, it never enlarges a small one. */
export function fitScale(image: Size, area: Area): number {
  const r = room(area);
  return clamp(
    Math.min(1, r.width / image.width, r.height / image.height),
    MIN_SCALE,
    1,
  );
}

/**
 * Keep the image on screen. On each axis: an image smaller than the room is
 * centred in it; a larger one may be panned, but never so far that its edge
 * comes inside the room's edge — there is always image under the controls'
 * inner edge, never backdrop.
 */
export function clampView(view: View, image: Size, area: Area): View {
  const r = room(area);
  const w = image.width * view.scale;
  const h = image.height * view.scale;
  const x =
    w <= r.width
      ? area.side + (r.width - w) / 2
      : clamp(view.x, area.width - area.side - w, area.side);
  const y =
    h <= r.height
      ? area.top + (r.height - h) / 2
      : clamp(view.y, area.height - area.bottom - h, area.top);
  return { scale: view.scale, x, y };
}

/** The fitted, centred view. */
export function fitView(image: Size, area: Area): View {
  return clampView({ scale: fitScale(image, area), x: 0, y: 0 }, image, area);
}

/**
 * Zoom to `scale` around the stage point `(px, py)`: the image pixel under that
 * point stays under it. The scale is held between fit and {@link MAX_SCALE},
 * and the result is clamped, so near an edge the point may drift rather than
 * pull backdrop into view.
 */
export function zoomAt(
  view: View,
  scale: number,
  px: number,
  py: number,
  image: Size,
  area: Area,
): View {
  const s = clamp(scale, fitScale(image, area), MAX_SCALE);
  const k = s / view.scale;
  return clampView(
    { scale: s, x: px - (px - view.x) * k, y: py - (py - view.y) * k },
    image,
    area,
  );
}

/** Move the view by `(dx, dy)` from `from`, clamped. */
export function panView(
  from: View,
  dx: number,
  dy: number,
  image: Size,
  area: Area,
): View {
  return clampView(
    { scale: from.scale, x: from.x + dx, y: from.y + dy },
    image,
    area,
  );
}

/**
 * What a click on the fitted image zooms to. 100% when fitting shrank the
 * image noticeably (below 80%). An image that already shows at (nearly) real
 * size — an icon — has nothing to reveal at 100%, so it gets a whole-number
 * enlargement from 2× to 8× that fills about 60% of the room: whole numbers
 * keep its pixels square.
 */
export function detailScale(image: Size, area: Area): number {
  if (fitScale(image, area) < 0.8) return 1;
  const r = room(area);
  const fill = Math.min(r.width / image.width, r.height / image.height);
  return clamp(Math.floor(fill * 0.6), 2, 8);
}

/**
 * The next zoom level for `+` (`dir = 1`) or `−` (`dir = -1`) from `scale`.
 * Walks {@link ZOOM_LADDER}; zooming out never goes below fit, and snaps to
 * fit when the next rung would pass it — so `−` always lands exactly on fit.
 */
export function stepScale(scale: number, dir: 1 | -1, fit: number): number {
  if (dir > 0) {
    return ZOOM_LADDER.find((v) => v > scale * 1.01) ?? MAX_SCALE;
  }
  const below = [...ZOOM_LADDER].reverse().find((v) => v < scale * 0.99);
  return below === undefined || below < fit ? fit : below;
}

/** The centre of the room — where button and key zooms happen. */
export function areaCenter(area: Area): { x: number; y: number } {
  return { x: area.width / 2, y: (area.top + area.height - area.bottom) / 2 };
}

/** Is the view zoomed past fit? (Then a drag pans and a click returns to fit.) */
export function isZoomed(view: View, image: Size, area: Area): boolean {
  return view.scale > fitScale(image, area) + EPS;
}

/** Is `view` at `scale`, within floating-point slack? */
export function isAtScale(view: View, scale: number): boolean {
  return Math.abs(view.scale - scale) < EPS;
}

/** Does the drawn image overflow the room on either axis? (Then the minimap shows.) */
export function overflows(view: View, image: Size, area: Area): boolean {
  const r = room(area);
  return (
    image.width * view.scale > r.width + 1 ||
    image.height * view.scale > r.height + 1
  );
}

/** The minimap: its drawn size, the image→minimap factor, and the part of
 *  the image currently on screen, in minimap pixels. */
export interface Minimap {
  readonly size: Size;
  readonly factor: number;
  readonly viewport: Rect;
}

/** The minimap's largest box. */
export const MINIMAP_BOX: Size = { width: 168, height: 132 };

export function minimapRect(
  view: View,
  image: Size,
  area: Area,
  box: Size = MINIMAP_BOX,
): Minimap {
  const k = Math.min(box.width / image.width, box.height / image.height);
  const s = view.scale;
  const x0 = clamp(-view.x / s, 0, image.width);
  const y0 = clamp(-view.y / s, 0, image.height);
  const x1 = clamp((area.width - view.x) / s, 0, image.width);
  const y1 = clamp((area.height - view.y) / s, 0, image.height);
  return {
    size: { width: image.width * k, height: image.height * k },
    factor: k,
    viewport: {
      left: x0 * k,
      top: y0 * k,
      width: (x1 - x0) * k,
      height: (y1 - y0) * k,
    },
  };
}

/** Centre the room on the image pixel `(ix, iy)`, keeping the scale. What a
 *  press or drag on the minimap does. */
export function centerOn(
  view: View,
  ix: number,
  iy: number,
  image: Size,
  area: Area,
): View {
  const c = areaCenter(area);
  return clampView(
    { scale: view.scale, x: c.x - ix * view.scale, y: c.y - iy * view.scale },
    image,
    area,
  );
}

/** The view that draws the image exactly over `rect` (matching its width,
 *  top-aligned) — where the open animation starts and the close one ends. */
export function viewOverRect(rect: Rect, image: Size): View {
  return { scale: rect.width / image.width, x: rect.left, y: rect.top };
}

/** The wheel fields {@link wheelZoomFactor} reads. */
export interface WheelInput {
  readonly deltaY: number;
  readonly deltaMode: number;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
}

/** Pixels per wheel "line" when the device reports lines (`deltaMode` 1). */
const LINE_PX = 16;

/**
 * The scale multiplier for one wheel event. A trackpad pinch arrives as a wheel
 * with `ctrlKey` set (and ⌘-scroll sets `metaKey`): that zooms fast, like the
 * browser's own pinch. A plain wheel zooms too, slower, so one notch of a
 * mouse wheel is a gentle step.
 */
export function wheelZoomFactor(e: WheelInput): number {
  const dy = e.deltaMode === 1 ? e.deltaY * LINE_PX : e.deltaY;
  const rate = e.ctrlKey || e.metaKey ? 0.01 : 0.0022;
  return Math.exp(-dy * rate);
}

/** A pointer that travels less than this between press and release is a click. */
export const DRAG_THRESHOLD = 4;

/**
 * How a thumbnail frames its image.
 *
 * - `tall` — taller than 2.2× its width (a full-page screenshot): the thumbnail
 *   shows the top part, fading out; the viewer shows it whole.
 * - `tiny` — at most 64px each way (an icon): shown at its real size, pixelated,
 *   on a checkerboard tile so there is something to click.
 * - `normal` — everything else: capped in height, never enlarged.
 */
export type ThumbnailShape = "normal" | "tall" | "tiny";

const TINY_MAX = 64;
const TALL_RATIO = 2.2;

export function thumbnailShape(size: Size): ThumbnailShape {
  if (size.width <= TINY_MAX && size.height <= TINY_MAX) return "tiny";
  if (size.height / size.width > TALL_RATIO) return "tall";
  return "normal";
}
