import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { DebugApp } from "@plugins/apps/plugins/debug/plugins/shell/web";
import { healthMonitorPane } from "./panes";
import { symbol } from "@plugins/ui/plugins/icons/core";

export { healthMonitorPane } from "./panes";

export default {
  description:
    "Health monitor debug pane: per-backend event-loop lag, phys_footprint/heap, and GC pressure over time, plus host load/memory/swap.",
  contributions: [
    Pane.Register({ pane: healthMonitorPane }),
    DebugApp.Sidebar({
      id: "health-monitor",
      title: "Health",
      icon: symbol("speed"),
      opens: { pane: healthMonitorPane, params: {} },
    }),
  ],
  slots: { "debug-health-monitor": healthMonitorPane },
} satisfies PluginDefinition;
