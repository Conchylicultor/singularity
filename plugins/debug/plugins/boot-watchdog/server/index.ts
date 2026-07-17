import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { ConfigV2 } from "@plugins/config_v2/server";
import { bootWatchdogConfig } from "../core";
import { bootWatchdogMonitorJob } from "./internal/monitor-job";
import { bootWedgeKind } from "./internal/boot-wedge-kind";

export default {
  description:
    "Boot-watchdog monitor: a main-only per-minute scheduled job that sweeps every worktree's boot channel off the shared filesystem and files a deduped boot-wedge report for any backend that never reached its `ready` line within the boot budget — superseded (post-hoc, once) or open (gateway-confirmed wedged-now, re-filed each tick). Structurally main-only: a perWorktree job cannot observe its own wedged boot.",
  register: [bootWatchdogMonitorJob],
  contributions: [
    ConfigV2.Register({ descriptor: bootWatchdogConfig }),
    bootWedgeKind,
  ],
} satisfies ServerPluginDefinition;
