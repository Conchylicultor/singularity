import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

export { rebuildDerivedViews } from "./internal/rebuild";
export { View } from "./internal/contribution";
export { relationIdentityBase } from "./internal/relation-identity";

export default {
  description:
    "Rebuilds plain DB views from source on every boot, in dependency order. Plain views are derived code (declared via the View contribution), not stateful migration schema.",
} satisfies ServerPluginDefinition;
