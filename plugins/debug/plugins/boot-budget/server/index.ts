import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { ConfigV2 } from "@plugins/config_v2/server";
import { bootBudgetConfig } from "../core";
import { bootBudgetMonitorJob } from "./internal/monitor-job";
import { bootBudgetKind } from "./internal/boot-budget-kind";

export default {
  description:
    "Boot-budget monitor: a cheap per-worktree scheduled job that reads the post-boot profile once and files a deduped boot-budget report per server boot hook (onReadyBlocking / onReady / onAllReady) or warmup span whose wall-time exceeds its per-phase budget, so a heavy boot hook is loud immediately instead of invisible-until-threshold.",
  register: [bootBudgetMonitorJob],
  contributions: [
    ConfigV2.Register({ descriptor: bootBudgetConfig }),
    bootBudgetKind,
  ],
} satisfies ServerPluginDefinition;
