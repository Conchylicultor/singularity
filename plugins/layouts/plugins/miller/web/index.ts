import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { MillerColumns } from "./components/miller-columns";
export { PaneOverlayHost } from "./components/pane-overlay-host";

export default {
  name: "Miller Columns",
  description:
    "Miller-columns layout renderer. Maps the matched pane chain to a horizontal sequence of resizable, collapsible columns.",
  contributions: [],
} satisfies PluginDefinition;
