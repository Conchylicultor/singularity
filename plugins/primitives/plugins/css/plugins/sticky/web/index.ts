import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export {
  Sticky,
  stickyClasses,
  type StickyProps,
  type StickyEdge,
} from "./internal/sticky";

export default {
  description:
    "Sticky positioning layout primitive: <Sticky edge offset layer> pins a header/footer to a scroll edge with a z-layer-aware stacking level.",
  contributions: [],
} satisfies PluginDefinition;
