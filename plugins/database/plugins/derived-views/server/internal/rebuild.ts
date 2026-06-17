import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { sql as drizzleSql } from "drizzle-orm";
import {
  getRegisteredViews,
  topoSortViews,
  compileCreateView,
} from "@plugins/database/plugins/derived-views/core";
import { Log } from "@plugins/primitives/plugins/log-channels/server";

const log = Log.channel("derived-views", { persist: true });

// Rebuilds the entire plain-derived-view layer from source on every boot.
//
// Plain views hold no data, so we can freely DROP + CREATE them. We drop in
// REVERSE dependency order (dependents before dependencies) and recreate in
// forward dependency order (dependencies before dependents) so Postgres never
// rejects a drop for an existing dependent or a create for a missing source.
//
// The whole thing runs in one transaction inside `onReadyBlocking` (before the
// server-ready barrier, no traffic yet): any failure throws and blocks boot
// loudly rather than serving against a half-rebuilt view layer.
//
// `db` is passed in (like runMigrations) so this module never imports
// @plugins/database/server — that would form a cycle (database/server calls us).
export async function rebuildDerivedViews(db: NodePgDatabase): Promise<void> {
  const ordered = topoSortViews(getRegisteredViews());
  if (ordered.length === 0) return;

  log.publish(
    `[derived-views] rebuilding ${ordered.length} view(s): ${ordered
      .map((v) => v.name)
      .join(", ")}`,
  );

  await db.transaction(async (tx) => {
    for (const v of [...ordered].reverse()) {
      await tx.execute(
        drizzleSql.raw(`DROP VIEW IF EXISTS "public"."${v.name}"`),
      );
    }
    for (const v of ordered) {
      await tx.execute(drizzleSql.raw(compileCreateView(v)));
    }
  });
}
