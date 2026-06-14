import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { ConfigV2, watchConfig } from "@plugins/config_v2/server";
import { slowOpConfig } from "../shared/config";
import { installSlowSpanHook } from "./internal/install-slow-span";

export default {
  description:
    "Records slow server spans (http/db/loader) as deduped slow-op reports.",
  contributions: [ConfigV2.Register({ descriptor: slowOpConfig })],
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
