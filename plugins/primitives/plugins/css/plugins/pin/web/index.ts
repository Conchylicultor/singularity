import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { Pin, pinClasses, type PinProps, type PinAnchor } from "./internal/pin";

export default {
  description:
    "Point-anchored absolute positioning primitive: <Pin to offset> places a child at a corner/edge-center/center of a relative parent. Sibling of Overlay.",
  contributions: [],
} satisfies PluginDefinition;
