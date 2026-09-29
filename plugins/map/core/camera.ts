import type { LatLng, MapOverlay } from "./overlays";

/** Zoom used when the map frames a single point: street level. */
export const SINGLE_POINT_ZOOM = 15;

export interface MapBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

/**
 * How a renderer should frame a set of positions.
 *
 * - `none`   — nothing to frame (the host never mounts a renderer for this).
 * - `point`  — every position is the same place: centre on it at street level,
 *              because fitting a zero-area box would zoom to the maximum.
 * - `bounds` — fit the box that contains them all.
 */
export type MapCamera =
  | { kind: "none" }
  | { kind: "point"; center: LatLng; zoom: number }
  | { kind: "bounds"; bounds: MapBounds };

/** Every coordinate an overlay occupies — a pin's position, a path's points, an area's ring. */
export function overlayPositions(overlays: readonly MapOverlay[]): LatLng[] {
  const out: LatLng[] = [];
  for (const o of overlays) {
    switch (o.kind) {
      case "pin":
        out.push(o.position);
        break;
      case "path":
        out.push(...o.points);
        break;
      case "area":
        out.push(...o.ring);
        break;
    }
  }
  return out;
}

/**
 * The camera that shows every position. Does not handle a set straddling the
 * antimeridian (it frames the long way round) — acceptable for one page's
 * places, and a renderer with its own bounds type can refine it.
 */
export function cameraFor(positions: readonly LatLng[]): MapCamera {
  const first = positions[0];
  if (first === undefined) return { kind: "none" };

  let south = first.lat;
  let north = first.lat;
  let west = first.lng;
  let east = first.lng;
  for (const p of positions) {
    if (p.lat < south) south = p.lat;
    if (p.lat > north) north = p.lat;
    if (p.lng < west) west = p.lng;
    if (p.lng > east) east = p.lng;
  }

  if (south === north && west === east) {
    return { kind: "point", center: first, zoom: SINGLE_POINT_ZOOM };
  }
  return { kind: "bounds", bounds: { south, west, north, east } };
}

/**
 * A stable identity for a SET of positions: equal for the same coordinates in
 * any order. A renderer re-frames only when this changes, so an edit that does
 * not move anything (a renamed place, a re-render) keeps the user's pan and zoom.
 */
export function positionsKey(positions: readonly LatLng[]): string {
  return positions
    .map((p) => `${p.lat},${p.lng}`)
    .sort()
    .join(";");
}
