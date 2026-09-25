import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

export { compileDerivedUpdatedAt } from "./internal/compile";
export { registerDerivedUpdatedAt } from "./internal/registry";
export { installDerivedUpdatedAt } from "./internal/install";
export type { TouchRule, DerivedUpdatedAtSpec } from "./internal/types";

export default {
  description:
    "Derived updatedAt: compiles a table's per-column touchedBy rules (declared in defineEntity's meta.updatedAt) into a BEFORE UPDATE trigger that sets updated_at = now() only when a counted column really changed and RAISEs on any app write to it; a registry filled at module eval, and the boot installer (signature-in-COMMENT, advisory-locked, asserted) the database plugin runs right after migrations.",
} satisfies ServerPluginDefinition;
