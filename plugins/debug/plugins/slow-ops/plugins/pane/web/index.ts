import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdComputer } from "react-icons/md";
import { SlowEvents } from "@plugins/debug/plugins/trace/plugins/pane/web";
import { SlowOpsView } from "./components/slow-ops-view";

// The per-worktree ranked slow-op aggregate — no longer its own sidebar pane.
// It contributes as the **Aggregates** tab of the unified Debug → Slow Events
// pane (owned by trace/pane), alongside the trace Events list and the Cluster
// tab. Import direction: slow-ops → trace/pane (slot token); trace never imports
// slow-ops, so the graph stays acyclic.
export default {
  description:
    "Aggregates tab of the Slow Events pane: a global, ranked overview of slow operations with per-operation caller attribution.",
  contributions: [
    SlowEvents.View({
      id: "aggregates",
      title: "Aggregates",
      icon: MdComputer,
      order: 20,
      component: SlowOpsView,
    }),
  ],
} satisfies PluginDefinition;
