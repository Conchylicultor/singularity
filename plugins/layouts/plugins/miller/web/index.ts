import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { MillerColumns } from "./components/miller-columns";

export default {
  id: "layouts-miller",
  name: "Miller Columns",
  description:
    "Miller-columns layout renderer. Maps the matched pane chain to a horizontal sequence of resizable, collapsible columns.",
  contributions: [],
} satisfies PluginDefinition;
