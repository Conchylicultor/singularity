import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

export { rebuildDerivedViews } from "./internal/rebuild";

export default {
  description:
    "Rebuilds plain DB views from source on every boot, in dependency order. Plain views are derived code (defineView), not stateful migration schema.",
} satisfies ServerPluginDefinition;
