import type { PluginDefinition } from "@core";

export { IconButton, type IconButtonProps } from "./components/icon-button";

export default {
  id: "icon-button",
  name: "Icon Button",
  description:
    "Ghost icon button with tooltip. Composes Button + Tooltip into a single component.",
  contributions: [],
} satisfies PluginDefinition;
