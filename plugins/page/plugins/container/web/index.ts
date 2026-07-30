import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { ContainerNoRow } from "./components/container-no-row";
export { ContainerBackdrop } from "./components/container-backdrop";
export { ContainerAnchor } from "./components/container-anchor";
export type { ContainerAnchorProps } from "./components/container-anchor";

export default {
  description:
    "Void-container primitive for the page editor: the shared null row renderer, the frame backdrop that owns a container decoration's geometry, and the anchor-decoration shell (static/interactive branch + the Remove/Delete structural actions). Contributes nothing itself — each container plugin registers its own block type through it.",
  contributions: [],
} satisfies PluginDefinition;
