import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { IconButton, type IconButtonProps } from "./components/icon-button";

export default {
  description:
    "Ghost icon button with tooltip. Composes Button + Tooltip into a single component.",
  contributions: [],
} satisfies PluginDefinition;
