import { defineServerContribution } from "@plugins/framework/plugins/server-core/core";
import type { Rollup } from "@plugins/database/plugins/derived-tables/core";

// A plugin declares each of its trigger-maintained rollups here, in its server
// plugin definition's `contributions: [...]` — the same pattern as the `View`
// contribution in derived-views. The framework collects all contributions at
// boot (before any onReadyBlocking runs), so the schema layer sees every rollup
// regardless of module import order, and `feedExemptTables()` /
// `rollupSources()` are complete when the change-feed snapshots its table set —
// there is no "rollup registered in a module nothing imported" footgun.
//
// The contributed value is a `Rollup`, which only `defineRollup` mints: every
// piece of its SQL is generated from the declaration.
export const DerivedTable = defineServerContribution<Rollup>("derived-table", {
  docLabel: (r) => r.table,
});
