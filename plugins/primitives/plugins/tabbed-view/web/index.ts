import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { defineTabbedView } from "./internal/define-tabbed-view";
export type { TabbedView, TabContribution } from "./internal/define-tabbed-view";

export default {
  description:
    "Factory for slot-backed tab-host views with localStorage persistence.",
  contributions: [],
} satisfies PluginDefinition;
