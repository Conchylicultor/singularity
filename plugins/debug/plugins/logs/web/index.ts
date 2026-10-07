import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { DebugApp } from "@plugins/apps/plugins/debug/plugins/shell/web";
import { logsPane, logChannelPane } from "./panes";
import { symbol } from "@plugins/ui/plugins/icons/core";

export { logsPane, logChannelPane } from "./panes";

export default {
  description: "System logs pane, opened from the Debug sidebar.",
  contributions: [
    Pane.Register({ pane: logsPane }),
    Pane.Register({ pane: logChannelPane }),
    DebugApp.Sidebar({
      id: "logs",
      title: "Logs",
      icon: symbol("terminal"),
      opens: { pane: logsPane, params: {} },
    }),
  ],
  slots: { logs: logsPane, "logs-channel": logChannelPane },
} satisfies PluginDefinition;
