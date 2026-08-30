import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { ContainerNoRow } from "./components/container-no-row";
export { ContainerBackdrop } from "./components/container-backdrop";
export { ContainerAnchor } from "./components/container-anchor";
export type { ContainerAnchorProps } from "./components/container-anchor";
export { ContainerCornerLabel } from "./components/container-corner-label";
export type { ContainerCornerLabelProps } from "./components/container-corner-label";

export default {
  description:
    "Void-container primitive for the page editor: the shared null row renderer, the frame backdrop that owns a container decoration's geometry, and the two decoration seats a container may ask for — a gutter glyph that leads its first line, or the card's own name in the box's top-right corner, revealed only while the pointer is inside it (both share the static/interactive branch and the appearance popover; the structural actions live on the rail of the line the container borrows). Contributes nothing itself — each container plugin registers its own block type through it.",
  contributions: [],
} satisfies PluginDefinition;
