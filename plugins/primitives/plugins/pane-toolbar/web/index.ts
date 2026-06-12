import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { definePaneToolbar } from "./internal/define-pane-toolbar";
export type {
  PaneToolbar,
  PaneToolbarItem,
  PaneToolbarOptions,
} from "./internal/define-pane-toolbar";

export default {
  description:
    "Factory for full-surface pane toolbars: a sanctioned render-slot header host with reorderable start/end zones. Use instead of hand-rolling a header bar.",
  contributions: [],
} satisfies PluginDefinition;
