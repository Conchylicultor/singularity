import type { PluginDefinition } from "@core";
import { Shell } from "@plugins/shell/web/slots";
import { Shell as ShellCommands } from "@plugins/shell/web/commands";
import { MdSettings } from "react-icons/md";
import { settingsPane } from "./views";

const configPlugin: PluginDefinition = {
  id: "config",
  name: "Config",
  description:
    "Per-worktree config. Plugins declare typed fields via defineConfig; values expose in this Settings pane.",
  contributions: [
    Shell.Sidebar({
      title: "Settings",
      icon: MdSettings,
      group: "System",
      onClick: () => ShellCommands.OpenPane(settingsPane()),
    }),
    Shell.Route({ pattern: "/settings", resolve: () => settingsPane() }),
  ],
};

export default configPlugin;
