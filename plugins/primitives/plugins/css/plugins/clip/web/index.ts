import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { Clip, clipClasses, type ClipProps, type ClipAxis } from "./internal/clip";

export default {
  description:
    "Clipping layout primitive: <Clip axis fill> hides overflow without scrolling. Sibling of Scroll, kept orthogonal.",
  contributions: [],
} satisfies PluginDefinition;
