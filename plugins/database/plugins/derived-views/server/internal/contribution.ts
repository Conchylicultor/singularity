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
export const View = defineServerContribution<{
  view: PgView;
  dependsOn?: string[];
}>("derived-view");
