import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdHub } from "react-icons/md";
import { SlowEvents } from "@plugins/debug/plugins/trace/plugins/pane/web";
import { ClusterView } from "./components/cluster-view";

export default {
  description:
    "Cross-worktree Cluster tab for the Slow Events pane: fans out across every worktree DB fork and merges them into one aggregate + a unified contention timeline.",
  contributions: [
    SlowEvents.View({
      id: "cluster",
      title: "Cluster",
      icon: MdHub,
      order: 30,
      component: ClusterView,
    }),
  ],
} satisfies PluginDefinition;
