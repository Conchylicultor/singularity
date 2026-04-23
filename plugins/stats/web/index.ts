import type { PluginDefinition } from "@core";
import { Shell } from "@plugins/shell/web";
import { MdInsights } from "react-icons/md";
import { statsPane } from "./panes";

export { Stats } from "./slots";
export { statsPane } from "./panes";

export default {
  id: "stats",
  name: "Stats",
  description: "Root plugin hosting stacked chart contributions from child plugins.",
  contributions: [
    Shell.Sidebar({
      title: "Stats",
      icon: MdInsights,
      group: "System",
      onClick: () => statsPane.open({}),
    }),
  ],
} satisfies PluginDefinition;
