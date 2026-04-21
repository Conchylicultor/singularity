import type { PluginDefinition } from "@core";
import { Shell, ShellCommands } from "@plugins/shell/web";
import { Debug } from "@plugins/debug/web";
import { MdTerminal } from "react-icons/md";
import { logPane } from "./views";

export default {
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
} satisfies PluginDefinition;
