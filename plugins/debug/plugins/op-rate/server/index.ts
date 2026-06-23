import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { ConfigV2 } from "@plugins/config_v2/server";
import { opRateConfig } from "../core";
import { opRateMonitorJob } from "./internal/monitor-job";
import { opRateKind } from "./internal/op-rate-kind";

export default {
  description:
    "Op-rate monitor: a cheap per-worktree scheduled job that diffs the runtime profiler's per-op call counts each tick and files one deduped report per hot op when its calls-in-window cross a per-kind threshold, through the existing reports engine.",
  register: [opRateMonitorJob],
  contributions: [
    ConfigV2.Register({ descriptor: opRateConfig }),
    opRateKind,
  ],
} satisfies ServerPluginDefinition;
