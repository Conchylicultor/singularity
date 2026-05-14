import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane, openPane } from "@plugins/primitives/plugins/pane/web";
import { DebugApp } from "@plugins/apps/plugins/debug/plugins/shell/web";
import { sidebarNavItem } from "@plugins/primitives/plugins/app-shell/web";
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
      ...sidebarNavItem({ title: "Logs", icon: MdTerminal, onClick: () => openPane(logsPane, {}, { mode: "root" }) }),
    }),
  ],
} satisfies PluginDefinition;
