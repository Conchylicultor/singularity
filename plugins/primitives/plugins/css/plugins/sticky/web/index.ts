import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export {
  Sticky,
  stickyClasses,
  type StickyProps,
  type StickyEdge,
} from "./internal/sticky";
export { stickyOffsetPx } from "./internal/sticky-offset";

export default {
  description:
    "Sticky positioning layout primitive: <Sticky edge offset layer> pins a header/footer to a scroll edge with a z-layer-aware stacking level; stickyOffsetPx turns a measured height into the exact offset a box stacked under it pins at.",
  contributions: [],
} satisfies PluginDefinition;
