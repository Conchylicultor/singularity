import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { PrototypeThumbnail } from "./components/prototype-thumbnail";
export { usePrototypeThumbnails } from "./use-thumbnails";

export default {
  description:
    "The rendered-preview cover for a prototype card: the cached PNG, the caller's fallback while it renders, and a visible 'Preview failed' marker carrying the reason.",
  contributions: [],
} satisfies PluginDefinition;
