import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { Shell } from "@plugins/shell/web";
import { opensPane } from "@plugins/primitives/plugins/app-shell/web";
import { statsPane } from "./panes";
import { Stats } from "./slots";
import { symbol } from "@plugins/ui/plugins/icons/core";

export { Stats } from "./slots";
export { statsPane } from "./panes";
export { useShowEmptyDays } from "./components/stats-context";

export default {
  collapsed: true,
  description:
    "Root plugin hosting stacked chart contributions from child plugins.",
  contributions: [
    Pane.Register({ pane: statsPane }),
    Shell.Sidebar({
      id: "stats",
      title: "Stats",
      icon: symbol("insights"),
      opens: opensPane(statsPane, {}),
    }),
  ],
  slots: { ...Stats, stats: statsPane },
} satisfies PluginDefinition;
