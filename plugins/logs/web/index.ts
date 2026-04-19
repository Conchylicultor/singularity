import type { PluginDefinition } from "@core";
import { Shell } from "@plugins/shell/web/slots";
import { Shell as ShellCommands } from "@plugins/shell/web/commands";
import { Debug } from "@plugins/debug/web/slots";
import { MdTerminal } from "react-icons/md";
import { logPane } from "./views";

const logsPlugin: PluginDefinition = {
  id: "logs",
  name: "Logs",
  description: "System logs pane, opened from the Debug sidebar.",
  contributions: [
    Debug.Item({
      id: "logs",
      title: "Logs",
      icon: MdTerminal,
      onClick: () => ShellCommands.OpenPane(logPane()),
    }),
    Shell.Route({
      pattern: "/logs",
      resolve: () => logPane(),
    }),
    Shell.Route({
      pattern: "/logs/:channel",
      resolve: (params) => logPane({ channel: params.channel }),
    }),
  ],
};

export default logsPlugin;
