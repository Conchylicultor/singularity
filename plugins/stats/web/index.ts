import type { PluginDefinition } from "@core";
import { Shell, ShellCommands } from "@plugins/shell/web";
import { MdInsights } from "react-icons/md";
import { statsPane } from "./views";

export { Stats } from "./slots";

export default {
  id: "stats",
  name: "Stats",
  description: "Root plugin hosting stacked chart contributions from child plugins.",
  contributions: [
    Shell.Sidebar({
      title: "Stats",
      icon: MdInsights,
      group: "System",
      onClick: () => ShellCommands.OpenPane(statsPane()),
    }),
    Shell.Route({
      pattern: "/stats",
      resolve: () => statsPane(),
    }),
  ],
} satisfies PluginDefinition;
