import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { SurfaceOverlayHost } from "./internal/surface-overlay-host";
export {
  SurfaceOverlay,
  type SurfaceOverlayProps,
} from "./internal/surface-overlay";

export default {
  description:
    "Surface-filling overlay primitive: <SurfaceOverlay> portals into the nearest <SurfaceOverlayHost> so its absolute inset-0 box fills the app tab's surface — escaping the pane layout in between without escaping to the viewport, so the tab bar and app rail stay visible. A missing host throws.",
  contributions: [],
} satisfies PluginDefinition;
