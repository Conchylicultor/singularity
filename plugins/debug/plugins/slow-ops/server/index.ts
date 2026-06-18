import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { ConfigV2, watchConfig } from "@plugins/config_v2/server";
import { slowOpConfig } from "../core";
import { submitClientSlowOp } from "../shared/endpoints";
import { slowOpsResource } from "./internal/resources";
import { slowOpKind } from "./internal/slow-op-kind";
import { handleClientSlowOp } from "./internal/handle-client-slow-op";
import { installSlowSpanHook } from "./internal/install-slow-span";

export { _slowOps } from "./internal/tables";
export { slowOpsResource } from "./internal/resources";
export { recordSlowOp } from "./internal/record-slow-op";
export type { RecordSlowOpInput } from "./internal/record-slow-op";
export { readSlowOpMarkers } from "./internal/read-markers";

export default {
  description:
    "Durable slow-op store: deduped per-operation aggregates with caller attribution, plus the slow-op report kind. Subscribes to runtime-profiler slow spans and client signals; files one rollup task.",
  contributions: [
    Resource.Declare(slowOpsResource),
    ConfigV2.Register({ descriptor: slowOpConfig }),
    slowOpKind,
  ],
  httpRoutes: {
    [submitClientSlowOp.route]: handleClientSlowOp,
  },
  // watchConfig fires the callback IMMEDIATELY on registration AND on every
  // change, so the first call performs the initial install and subsequent calls
  // reinstall the hook with the new thresholds. installSlowSpanHook disposes the
  // prior subscription each time, so there is no double-install.
  onReady: () => {
    watchConfig(slowOpConfig, (vals) => {
      installSlowSpanHook(vals);
    });
  },
} satisfies ServerPluginDefinition;
