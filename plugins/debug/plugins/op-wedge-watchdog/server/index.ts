import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { ConfigV2 } from "@plugins/config_v2/server";
import { opWedgeWatchdogConfig } from "../core";
import { opWedgeWatchdogMonitorJob } from "./internal/monitor-job";
import { opWedgeKind } from "./internal/op-wedge-kind";

export default {
  description:
    "Op-wedge watchdog: a main-only per-minute scheduled job that sweeps every worktree's CLI op markers off shared disk and, for a `./singularity {build,check,push}` whose pid is alive past the budget (default 15 min), runs capture-then-reap: native forensics from the LIVE wedged process (sample, recursive child tree, lsof, twice-sampled CPU delta), then — for pre-armed ops — a JS-level interrogation over the inspector (JSC sampling profiler, heap delta, protected-object histogram, paired lsofs), then reaps the process (SIGTERM→SIGKILL) so one wedge cannot gridlock the fleet, and files ONE deduped cli-op-wedge report per (worktree, op, pid). Duress-exempt, since a wedged op is itself a cause of host duress.",
  register: [opWedgeWatchdogMonitorJob],
  contributions: [
    ConfigV2.Register({ descriptor: opWedgeWatchdogConfig }),
    opWedgeKind,
  ],
} satisfies ServerPluginDefinition;
