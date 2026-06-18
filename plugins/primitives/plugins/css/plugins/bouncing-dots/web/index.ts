import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { BouncingDots, type BouncingDotsProps } from "./internal/bouncing-dots";

export default {
  description:
    "Three-dot bouncing activity indicator for 'working'/'pending' states. Renders three animate-bounce dots with staggered delays; size sm (size-1) or md (size-1.5, default).",
  contributions: [],
} satisfies PluginDefinition;
