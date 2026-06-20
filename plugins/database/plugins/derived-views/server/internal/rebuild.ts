import { createHash } from "node:crypto";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { sql as drizzleSql } from "drizzle-orm";
import { getViewConfig } from "drizzle-orm/pg-core";
import {
  topoSortViews,
  compileCreateView,
  type RegisteredView,
} from "@plugins/database/plugins/derived-views/core";
import { Log } from "@plugins/primitives/plugins/log-channels/server";
import { View } from "./contribution";

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
//
// SKIP WHEN UNCHANGED. The DROP+CREATE holds an AccessExclusive lock over each
// view until commit. During a hot-swap restart the *previous* backend is still
// serving reads of those same views against the same DB, so the exclusive
// window deadlocked concurrent readers (the tasks loader, the allow-files poll
// — see the per-query deadlock retry in database/server). The view layer is a
// pure function of source, so we fingerprint the compiled DDL and skip the
// rebuild entirely when it matches what is already live — removing the lock
// window from the steady-state restart path. The rebuild (and its brief
// deadlock risk) now only runs on a genuine view edit, not every restart.
export async function rebuildDerivedViews(db: NodePgDatabase): Promise<void> {
  // Views are declared via the `View` server contribution on each owning
  // plugin's definition. The framework collects all contributions before any
  // onReadyBlocking runs, so this list is complete regardless of import order.
  const declared: RegisteredView[] = View.getContributions().map(
    ({ view, dependsOn }) => ({
      name: getViewConfig(view).name,
      view,
      dependsOn: dependsOn ?? [],
    }),
  );
  const ordered = topoSortViews(declared);
  if (ordered.length === 0) return;

  // Content signature of the whole view layer: each view's name + compiled DDL,
  // in dependency order. Identical signature ⇒ identical views ⇒ nothing to do.
  const compiled = ordered.map((v) => ({ name: v.name, ddl: compileCreateView(v) }));
  const signature = createHash("sha256")
    .update(compiled.map((c) => `${c.name}\n${c.ddl}`).join("\n--\n"))
    .digest("hex");

  await db.transaction(async (tx) => {
    // Bookkeeping for the derived-view layer's content signature. Created
    // idempotently here (not via a migration) because, like the views it
    // tracks, it is derived-layer state — not schema in the migration chain.
    // It lives in the DB so a worktree fork carries the signature with its
    // views (a `CREATE DATABASE ... TEMPLATE` copies the row), avoiding a
    // spurious first-boot rebuild on the fork.
    await tx.execute(
      drizzleSql.raw(
        `CREATE TABLE IF NOT EXISTS "public"."derived_view_state" (
           id boolean PRIMARY KEY DEFAULT true CHECK (id),
           signature text NOT NULL
         )`,
      ),
    );

    const priorRes = await tx.execute(
      drizzleSql.raw(`SELECT signature FROM "public"."derived_view_state" LIMIT 1`),
    );
    const prior = (priorRes.rows as unknown as { signature: string }[])[0]?.signature;

    // Guard against a view dropped out-of-band: only trust the signature when
    // every declared view also physically exists.
    const existingRes = await tx.execute(
      drizzleSql.raw(
        `SELECT table_name FROM information_schema.views WHERE table_schema = 'public'`,
      ),
    );
    const existing = new Set(
      (existingRes.rows as unknown as { table_name: string }[]).map((r) => r.table_name),
    );
    const allPresent = ordered.every((v) => existing.has(v.name));

    if (prior === signature && allPresent) {
      log.publish(
        `[derived-views] up to date (${ordered.length} view(s), signature unchanged) — skipping rebuild`,
      );
      return;
    }

    log.publish(
      `[derived-views] rebuilding ${ordered.length} view(s): ${ordered
        .map((v) => v.name)
        .join(", ")}`,
    );

    for (const v of [...ordered].reverse()) {
      await tx.execute(drizzleSql.raw(`DROP VIEW IF EXISTS "public"."${v.name}"`));
    }
    for (const v of compiled) {
      await tx.execute(drizzleSql.raw(v.ddl));
    }

    await tx.execute(
      drizzleSql`
        INSERT INTO "public"."derived_view_state" (id, signature)
        VALUES (true, ${signature})
        ON CONFLICT (id) DO UPDATE SET signature = EXCLUDED.signature
      `,
    );
  });
}
