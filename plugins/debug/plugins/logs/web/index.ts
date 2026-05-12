import type { PluginDefinition } from "@core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { DebugApp } from "@plugins/apps/plugins/debug/plugins/shell/web";
import { MdTerminal } from "react-icons/md";
import { logsPane, logChannelPane } from "./panes";

export { logsPane, logChannelPane } from "./panes";

export default {
  id: "logs",
  name: "Logs",
  description: "System logs pane, opened from the Debug sidebar.",
  contributions: [
    Pane.Register({ pane: logsPane }),
    Pane.Register({ pane: logChannelPane }),
    DebugApp.Sidebar({
      id: "logs",
      title: "Logs",
      icon: MdTerminal,
      onClick: () => logsPane.open({}),
    }),
  ],
} satisfies PluginDefinition;
