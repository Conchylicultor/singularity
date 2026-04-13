import type { PluginDefinition } from "@core";
import { Shell } from "@plugins/shell/web/slots";
import { Shell as ShellCommands } from "@plugins/shell/web/commands";
import { MdTerminal } from "react-icons/md";
import { logPane } from "./views";

const logsPlugin: PluginDefinition = {
  id: "logs",
  name: "Logs",
  description: "System logs pane, opened from a sidebar button.",
  contributions: [
    Shell.Sidebar({
      title: "Logs",
      icon: MdTerminal,
      group: "System",
      onClick: () => ShellCommands.OpenPane(logPane()),
    }),
  ],
};

export default logsPlugin;
