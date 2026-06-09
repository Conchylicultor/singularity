import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { PaneLayoutHost } from "./components/pane-layout-host";

export default {
  description:
    "Mixing host that dispatches each active pane to Full-pane or Miller per the app's own full-surface pane list. Resolves the route once and provides the shared match context.",
  contributions: [],
} satisfies PluginDefinition;
