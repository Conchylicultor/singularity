import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export {
  ViewportOverlay,
  type ViewportOverlayProps,
} from "./internal/viewport-overlay";

export default {
  description:
    "Viewport-filling overlay primitive: self-portals to document.body + z-layer + theme-scope so fixed inset-0 fills the real viewport, never a transformed ancestor.",
  contributions: [],
} satisfies PluginDefinition;
