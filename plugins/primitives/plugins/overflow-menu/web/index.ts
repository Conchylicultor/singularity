import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export {
  OverflowMenu,
  type OverflowMenuItem,
  type OverflowMenuProps,
} from "./internal/overflow-menu";

export default {
  description:
    "Single-line row that keeps as many children inline as fit and collapses the overflow behind a trailing ⋯ dropdown menu. Built on responsive-overflow; reserves the trigger's width so it is never clipped.",
  contributions: [],
} satisfies PluginDefinition;
