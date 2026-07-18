import { finalizeOrphanedOps } from "@plugins/debug/plugins/profiling/plugins/op-log/server";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { isMain } from "@plugins/infra/plugins/paths/server";
import { isWorktreeOpActive } from "@plugins/infra/plugins/worktree/server";
import { handleOpDetail } from "./internal/handle-op-detail";
import { handleOpProfiling } from "./internal/handle-op-profiling";
import { getOpDetail, getOpProfiling } from "../shared/endpoints";

export default {
  description: "Op contention profiling data endpoint (build / push / check).",
  httpRoutes: {
    [getOpProfiling.route]: handleOpProfiling,
    [getOpDetail.route]: handleOpDetail,
  },
  // Reconcile orphaned op-log records (ops hard-killed before their CLI could
  // write a terminal record) — ONE reconciler for all three kinds. The op log is
  // a single global file, so only the main backend reconciles it — gating avoids
  // concurrent writes from every worktree backend. Work still running is skipped
  // via the op marker.
  onReady: async () => {
    if (!isMain()) return;
    await finalizeOrphanedOps(isWorktreeOpActive);
  },
} satisfies ServerPluginDefinition;
