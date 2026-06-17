import { useSyncExternalStore, type CSSProperties } from "react";

/**
 * A snap target: the full desktop, a half, or a quarter. `maximize` is the full
 * screen (the unified replacement for the old `maximized` boolean); the rest are
 * Aero-style edge/corner tiles.
 */
export type SnapZone =
  | "maximize"
  | "left"
  | "right"
  | "top"
  | "bottom"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

/** Gutter (px) between a snapped tile and the desktop edges / centerlines. */
export const SNAP_GAP = 8;

/**
 * The absolute CSS box for a snap zone, expressed purely in insets + percentages
 * so it is resolution-independent (reflows on desktop resize) — the single source
 * of truth shared by the placement's container style and the preview overlay.
 * `maximize` fills the whole backdrop edge-to-edge; halves/quarters keep a
 * {@link SNAP_GAP} gutter from the edges and shared centerlines.
 */
export function snapBox(zone: SnapZone): CSSProperties {
  if (zone === "maximize") return { left: 0, top: 0, right: 0, bottom: 0 };
  const edge = `${SNAP_GAP}px`;
  // Half a tile minus its outer-edge gutter and half the centerline gutter.
  const half = `calc(50% - ${SNAP_GAP * 1.5}px)`;
  switch (zone) {
    case "left":
      return { left: edge, top: edge, bottom: edge, width: half };
    case "right":
      return { right: edge, top: edge, bottom: edge, width: half };
    case "top":
      return { top: edge, left: edge, right: edge, height: half };
    case "bottom":
      return { bottom: edge, left: edge, right: edge, height: half };
    case "top-left":
      return { top: edge, left: edge, width: half, height: half };
    case "top-right":
      return { top: edge, right: edge, width: half, height: half };
    case "bottom-left":
      return { bottom: edge, left: edge, width: half, height: half };
    case "bottom-right":
      return { bottom: edge, right: edge, width: half, height: half };
  }
}

/** A keyboard tiling nudge along one axis (the four arrow directions). */
export type SnapDirection = "left" | "right" | "up" | "down";

/**
 * The outcome of a directional keyboard snap: re-tile to a zone (`zone: null`
 * restores the free floating box) or minimize the window to the dock.
 */
export type SnapAction =
  | { type: "snap"; zone: SnapZone | null }
  | { type: "minimize" };

const toSnap = (zone: SnapZone | null): SnapAction => ({ type: "snap", zone });
const MINIMIZE: SnapAction = { type: "minimize" };

/**
 * Windows-Aero-style directional tiling state machine for keyboard snapping.
 *
 * A left/right half is the middle rung of its vertical axis: Up/Down tile it to
 * the matching quarter and back, while Left/Right toggle the half off (restore
 * to free) or flip a quarter across to the other side. Maximize caps the
 * vertical chain — Up maximizes from free, Down restores to free and then
 * minimizes. Only the zones reachable by mouse drag are produced (no standalone
 * top/bottom halves), so keyboard tiling and pointer tiling stay consistent.
 */
export function nextSnapAction(
  current: SnapZone | null,
  dir: SnapDirection,
): SnapAction {
  switch (dir) {
    case "left":
      return snapLeft(current);
    case "right":
      return snapRight(current);
    case "up":
      return snapUp(current);
    case "down":
      return snapDown(current);
  }
}

function snapLeft(current: SnapZone | null): SnapAction {
  switch (current) {
    case null:
    case "maximize":
      return toSnap("left");
    case "right":
      return toSnap(null);
    case "top":
    case "top-right":
      return toSnap("top-left");
    case "bottom":
    case "bottom-right":
      return toSnap("bottom-left");
    case "left":
    case "top-left":
    case "bottom-left": // already as far left as it goes
      return toSnap(current);
  }
}

function snapRight(current: SnapZone | null): SnapAction {
  switch (current) {
    case null:
    case "maximize":
      return toSnap("right");
    case "left":
      return toSnap(null);
    case "top":
    case "top-left":
      return toSnap("top-right");
    case "bottom":
    case "bottom-left":
      return toSnap("bottom-right");
    case "right":
    case "top-right":
    case "bottom-right":
      return toSnap(current);
  }
}

function snapUp(current: SnapZone | null): SnapAction {
  switch (current) {
    case null:
      return toSnap("maximize");
    case "left":
      return toSnap("top-left");
    case "right":
      return toSnap("top-right");
    case "bottom-left":
      return toSnap("left");
    case "bottom-right":
      return toSnap("right");
    case "bottom":
      return toSnap(null);
    case "maximize":
    case "top":
    case "top-left":
    case "top-right":
      return toSnap(current);
  }
}

function snapDown(current: SnapZone | null): SnapAction {
  switch (current) {
    case null:
      return MINIMIZE;
    case "maximize":
    case "top":
      return toSnap(null);
    case "left":
      return toSnap("bottom-left");
    case "right":
      return toSnap("bottom-right");
    case "top-left":
      return toSnap("left");
    case "top-right":
      return toSnap("right");
    case "bottom":
    case "bottom-left":
    case "bottom-right":
      return MINIMIZE;
  }
}

/** Distance (px) from an edge that arms a half / maximize snap. */
const EDGE = 28;
/** Band (px) along the secondary axis of an edge that promotes a half to a quarter. */
const CORNER = 110;

/**
 * Resolve which snap zone a titlebar drag is hovering, given the pointer in
 * backdrop-relative coords and the backdrop size. Corners win over edges: hugging
 * the top/bottom edge within {@link CORNER} of a side (or a side within CORNER of
 * top/bottom) gives a quarter; the top edge alone maximizes; a side alone is a
 * half. The bottom edge alone does NOT snap (it would fight the dock). Returns
 * null when the pointer is away from every edge or outside the backdrop.
 */
export function detectSnapZone(
  px: number,
  py: number,
  width: number,
  height: number,
): SnapZone | null {
  if (px < 0 || py < 0 || px > width || py > height) return null;
  const nearLeft = px <= EDGE;
  const nearRight = px >= width - EDGE;
  const nearTop = py <= EDGE;
  const nearBottom = py >= height - EDGE;
  const cornerL = px <= CORNER;
  const cornerR = px >= width - CORNER;
  const cornerT = py <= CORNER;
  const cornerB = py >= height - CORNER;

  if (nearTop || nearBottom) {
    if (cornerL) return nearTop ? "top-left" : "bottom-left";
    if (cornerR) return nearTop ? "top-right" : "bottom-right";
  }
  if (nearLeft || nearRight) {
    if (cornerT) return nearLeft ? "top-left" : "top-right";
    if (cornerB) return nearLeft ? "bottom-left" : "bottom-right";
  }
  if (nearTop) return "maximize";
  if (nearLeft) return "left";
  if (nearRight) return "right";
  return null;
}

// Transient snap-preview channel: the dragging window's titlebar writes the
// hovered zone here on every pointermove; the desktop-level <SnapPreviewOverlay>
// (a Foreground sibling of the windows, a different React subtree) reads it. A
// module-global is the right shared channel here for the exact reason
// `useWindowGeometryMap` is one — writer and reader live in unrelated subtrees
// under the generic surface host, with only ever one drag in flight.
// eslint-disable-next-line scoped-store/no-module-mutable-store -- page-global by design: a transient drag-preview channel shared between the dragging window's chrome and the desktop-level overlay (separate subtrees), mirroring the module-global geometry store in this plugin.
let snapPreview: SnapZone | null = null;
const subscribers = new Set<() => void>();

/** Set (or clear, with null) the live snap-preview zone. No-op when unchanged. */
export function setSnapPreview(zone: SnapZone | null) {
  if (snapPreview === zone) return;
  snapPreview = zone;
  for (const fn of subscribers) fn();
}

/** Reactive read of the live snap-preview zone (null while not previewing). */
export function useSnapPreview(): SnapZone | null {
  return useSyncExternalStore(
    (cb) => {
      subscribers.add(cb);
      return () => subscribers.delete(cb);
    },
    () => snapPreview,
    () => snapPreview,
  );
}
