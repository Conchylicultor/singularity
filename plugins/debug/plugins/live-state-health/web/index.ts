import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { DebugApp } from "@plugins/apps/plugins/debug/plugins/shell/web";
import { liveStateHealthPane } from "./panes";
import { symbol } from "@plugins/ui/plugins/icons/core";

export { liveStateHealthPane } from "./panes";

export default {
  description:
    "Live health inspector for the client live-state pipeline (sockets, leader election, per-resource subscriptions), opened from the Debug sidebar.",
  contributions: [
    Pane.Register({ pane: liveStateHealthPane }),
    DebugApp.Sidebar({
      id: "live-state-health",
      title: "Live State",
      icon: symbol("monitor-heart"),
      opens: { pane: liveStateHealthPane, params: {} },
    }),
  ],
  slots: { "live-state-health": liveStateHealthPane },
} satisfies PluginDefinition;
