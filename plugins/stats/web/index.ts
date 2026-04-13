import type { PluginDefinition } from "@core";
import { Shell } from "@plugins/shell/web/slots";
import { Shell as ShellCommands } from "@plugins/shell/web/commands";
import { MdInsights } from "react-icons/md";
import { statsPane } from "./views";

const statsPlugin: PluginDefinition = {
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
};

export default statsPlugin;
