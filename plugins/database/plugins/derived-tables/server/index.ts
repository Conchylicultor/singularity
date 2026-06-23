import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

export { DerivedTable } from "./internal/contribution";
export { rebuildDerivedTables, feedExemptTables } from "./internal/rebuild";

export default {
  description:
    "Rebuilds trigger-maintained materialized rollup tables from source on every boot. A rollup is derived state (declared via the DerivedTable contribution), kept current incrementally by STATEMENT triggers — a hand-rolled IVM for aggregates too expensive to recompute live yet not expressible as a plain view.",
} satisfies ServerPluginDefinition;
