import { defineServerContribution } from "@plugins/framework/plugins/server-core/core";
import type { PgView } from "drizzle-orm/pg-core";

// A plugin declares each of its derived (plain, non-materialized) views here, in
// its server plugin definition's `contributions: [...]`. The framework collects
// all contributions at boot (before any onReadyBlocking runs), so
// rebuildDerivedViews sees every view regardless of module import order — there
// is no "view registered in a module nothing imported" footgun.
//
// `dependsOn` lists the SQL *names* of OTHER derived views this view reads from
// (e.g. ["attempts_v"]), so the rebuild can drop/create in dependency order. It
// references the name string, not the JS object, so a cross-plugin view
// dependency never forces an import.
//
// `identityTable` names the base table whose primary key equals this view's row
// id — true for a 1:1 PK-preserving view (e.g. `conversations_v` selects every
// `_conversations` column over an inner join, so `conversations_v.id ==
// _conversations.id`). It lets the L4 change-feed forward a scoped base-table
// change THROUGH the view as scoped (same ids) instead of degrading to FULL.
// Omit it for views whose row identity does not map 1:1 to a single base PK
// (aggregations that reshape cardinality) — those stay FULL-on-change. See
// research/2026-06-20-global-scoped-recompute-default.md.
export const View = defineServerContribution<{
  view: PgView;
  dependsOn?: string[];
  identityTable?: string;
}>("derived-view");
