import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdHub } from "react-icons/md";
import { SlowOps } from "@plugins/debug/plugins/slow-ops/plugins/pane/web";
import { ClusterView } from "./components/cluster-view";

export default {
  description:
    "Cross-worktree cluster tab for the Slow Ops pane: fans out across every worktree DB fork and merges them into one aggregate + a unified contention timeline.",
  contributions: [
    SlowOps.View({
      id: "cluster",
      title: "Cluster",
      icon: MdHub,
      order: 20,
      component: ClusterView,
    }),
  ],
} satisfies PluginDefinition;
