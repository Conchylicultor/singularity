import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { handleStart } from "./internal/handle-start";
import { handleStop } from "./internal/handle-stop";
import { handleStatus } from "./internal/handle-status";
import { stopEmitting } from "./internal/emitter";
import { startEmit, stopEmit, getEmitStatus } from "../shared/endpoints";

export default {
  description:
    "Synthetic no-op live-state push emitter: drives N triggerResourcePush calls/sec for a chosen resource on a bounded setInterval (hard auto-stop cap), so churn-driven render/DOM bugs reproduce deterministically. Surfaced as the Debug → Live-State Emit pane. The /api/resources/_debug route powering the resource dropdown is served by the kernel, not here.",
  httpRoutes: {
    [startEmit.route]: handleStart,
    [stopEmit.route]: handleStop,
    [getEmitStatus.route]: handleStatus,
  },
  onShutdown: () => {
    stopEmitting();
  },
} satisfies ServerPluginDefinition;
