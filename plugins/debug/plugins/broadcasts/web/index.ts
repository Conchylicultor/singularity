import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { DebugApp } from "@plugins/apps/plugins/debug/plugins/shell/web";
import { broadcastsPane } from "./panes";
import { symbol } from "@plugins/ui/plugins/icons/core";

export { broadcastsPane } from "./panes";

export default {
  description:
    "View and edit cli/broadcasts.json broadcast messages for stale worktrees.",
  contributions: [
    Pane.Register({ pane: broadcastsPane }),
    DebugApp.Sidebar({
      id: "broadcasts",
      title: "Broadcasts",
      icon: symbol("feedback"),
      opens: { pane: broadcastsPane, params: {} },
    }),
  ],
  slots: { "debug-broadcasts": broadcastsPane },
} satisfies PluginDefinition;
