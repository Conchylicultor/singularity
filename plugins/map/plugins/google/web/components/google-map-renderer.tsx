import { lazyComponent } from "@plugins/primitives/plugins/lazy-component/web";
import type { MapRendererProps } from "@plugins/map/web";

/**
 * The real renderer statically imports `@vis.gl/react-google-maps`; loading it
 * lazily keeps that off the eager plugin-boot wave, so the Maps code is fetched
 * only when a map actually mounts. (The Maps JavaScript API itself is fetched
 * from Google later still, by the provider inside.)
 */
export const GoogleMapRenderer = lazyComponent<MapRendererProps>(() =>
  import("./google-map-impl").then((m) => ({ default: m.GoogleMapRenderer })),
);
