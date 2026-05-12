import type { PluginDefinition } from "@core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { sidebarNavItem } from "@plugins/primitives/plugins/app-shell/web";
import { Shell } from "@plugins/shell/web";
import { MdInsights } from "react-icons/md";
import { statsPane } from "./panes";

export { Stats } from "./slots";
export { statsPane } from "./panes";
export { useShowEmptyDays } from "./components/stats-context";

export default {
  id: "stats",
  name: "Stats",
  description: "Root plugin hosting stacked chart contributions from child plugins.",
  contributions: [
    Pane.Register({ pane: statsPane }),
    Shell.Sidebar({
      id: "stats",
      ...sidebarNavItem({ title: "Stats", icon: MdInsights, onClick: () => statsPane.open({}) }),
    }),
  ],
} satisfies PluginDefinition;
