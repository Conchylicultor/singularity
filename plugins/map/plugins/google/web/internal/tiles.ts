import type { MapTileScheme } from "@plugins/map/core";

/**
 * The scheme Google draws its tiles in. One constant for both halves of the
 * promise: the contribution declares it to the map host (which hands it to
 * every pin), and the canvas pins Google's own `colorScheme` to it — so the
 * declaration cannot drift from what is on screen.
 */
export const GOOGLE_TILES: MapTileScheme = "light";

export const GOOGLE_COLOR_SCHEME = {
  light: "LIGHT",
  dark: "DARK",
} as const satisfies Record<MapTileScheme, "LIGHT" | "DARK">;
