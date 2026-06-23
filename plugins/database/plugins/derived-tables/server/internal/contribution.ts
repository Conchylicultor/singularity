import { defineServerContribution } from "@plugins/framework/plugins/server-core/core";
import type { DerivedRollupSpec } from "@plugins/database/plugins/derived-tables/core";

// A plugin declares each of its trigger-maintained materialized rollups here, in
// its server plugin definition's `contributions: [...]` — exactly the same
// pattern as the `View` contribution in derived-views. The framework collects
// all contributions at boot (before any onReadyBlocking runs), so
// rebuildDerivedTables sees every rollup regardless of module import order, and
// feedExemptTables() is complete when the change-feed snapshots its table set —
// there is no "rollup registered in a module nothing imported" footgun.
//
// The contributed value is an opaque-SQL `DerivedRollupSpec` (table + create /
// function / trigger / reconcile DDL strings). The generic layer never inspects
// the rollup's shape; it only orchestrates the four DDL phases.
export const DerivedTable = defineServerContribution<DerivedRollupSpec>("derived-table");
