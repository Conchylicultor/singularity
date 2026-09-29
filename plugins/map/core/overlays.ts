/**
 * The map's overlay vocabulary: plain data, no React, no vendor. Everything a
 * layer can put on a map is one of these, and every renderer draws all of them —
 * which is what lets layers and renderers be written without knowing about each
 * other.
 *
 * Styles are SEMANTIC (a tone, a dash), never colours: the renderer resolves a
 * tone against the theme it is painted in, so a map re-themes with the app.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * The theme tones an overlay can be painted in. Each names a colour token the
 * app already defines (`--primary`, `--muted-foreground`, …); the renderer maps
 * a tone to its token, so a layer never spells a colour.
 */
export type MapTone =
  "primary" | "muted" | "destructive" | "success" | "warning" | "info";

/** Stroke styling shared by paths and area outlines. */
export interface MapStrokeStyle {
  /** Defaults to `primary`. */
  tone?: MapTone;
  dashed?: boolean;
  /** Stroke width in CSS pixels. Defaults to the renderer's regular weight. */
  width?: number;
}

/**
 * A point, rendered as React content. `pinType` picks the pin component
 * (`GeoMap.Pin` dispatches on it), so the layer that produces a pin decides what
 * it looks like and the renderer never styles one itself.
 */
export interface MapPin {
  kind: "pin";
  id: string;
  position: LatLng;
  pinType: string;
  /** The pin's name: its accessible label, and what the default pin shows. */
  label?: string;
  /** Opaque payload for the pin component of `pinType`. */
  data?: unknown;
}

/** An open polyline through `points`, in order. */
export interface MapPath {
  kind: "path";
  id: string;
  points: LatLng[];
  style?: MapStrokeStyle;
}

/** A closed polygon; `ring` is its outline (the closing edge is implied). */
export interface MapArea {
  kind: "area";
  id: string;
  ring: LatLng[];
  style?: MapStrokeStyle;
}

export type MapOverlay = MapPin | MapPath | MapArea;

/** The CSS custom property each tone is painted from. */
export const MAP_TONE_TOKEN: Record<MapTone, string> = {
  primary: "--primary",
  muted: "--muted-foreground",
  destructive: "--destructive",
  success: "--success",
  warning: "--warning",
  info: "--info",
};
