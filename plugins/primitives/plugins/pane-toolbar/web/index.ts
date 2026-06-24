import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { definePaneToolbar } from "./internal/define-pane-toolbar";
export type {
  PaneToolbar,
  PaneToolbarOptions,
} from "./internal/define-pane-toolbar";
// `PaneToolbarItem` is owned by the `pane` plugin (PaneChrome renders it); import
// it from `@plugins/primitives/plugins/pane/web` directly. Re-exporting it here
// is a banned cross-plugin re-export.

export default {
  description:
    "Factory for a pane's custom header: reorderable start/end render-slot zones wired into PaneChrome via chrome.header. Use instead of hand-rolling a header bar.",
  contributions: [],
} satisfies PluginDefinition;
