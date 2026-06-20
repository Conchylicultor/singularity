import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { sql as drizzleSql } from "drizzle-orm";
import { Log } from "@plugins/primitives/plugins/log-channels/server";

const log = Log.channel("change-feed", { persist: true });

// Tables we never want a change-feed trigger on. Keep this minimal: a trigger on
// an unread table is harmless (the runtime finds no resource depending on it and
// drops the change). We only exclude the migrations bookkeeping table — it is
// written by the migration runner inside `onReadyBlocking`, never read by a
// live-state loader, and triggering on it adds pure noise. graphile_worker lives
// in its own schema, so it is already excluded by the public-schema filter.
const DENYLIST = new Set<string>(["__singularity_migrations"]);

// The generic STATEMENT-level trigger function. It is deterministic, data-less
// DDL — created with CREATE OR REPLACE on every boot (never a migration), exactly
// like derived-views.
//
// One function serves every table and every op:
//  - INSERT / UPDATE read the `new_rows` transition table; DELETE reads
//    `old_rows`. The trigger declares the appropriate transition table.
//  - The PK column is passed per-table as TG_ARGV[0]. With a single-column PK we
//    aggregate the changed PK values into a text[]; with a composite/absent PK
//    TG_ARGV[0] is empty → ids stays NULL → the consumer treats it as
//    FULL-for-table (still correct, just unscoped).
//  - Payload is json {t, op, ids}. NOTIFY has a ~8 KB ceiling; if the payload
//    exceeds 7000 bytes (large bulk statement) we re-emit with ids = NULL so the
//    consumer degrades to FULL-for-table rather than dropping the NOTIFY.
//  - STATEMENT-level + transition tables means exactly one NOTIFY per statement,
//    not one per row — the whole reason this is cheap on bulk writes.
const NOTIFY_FUNCTION_DDL = `
CREATE OR REPLACE FUNCTION live_state_notify() RETURNS trigger AS $live_state$
DECLARE
  pk_col text := TG_ARGV[0];
  ids text[];
  payload text;
BEGIN
  IF pk_col IS NOT NULL AND pk_col <> '' THEN
    IF TG_OP = 'DELETE' THEN
      EXECUTE format('SELECT array_agg(%I::text) FROM old_rows', pk_col) INTO ids;
    ELSE
      EXECUTE format('SELECT array_agg(%I::text) FROM new_rows', pk_col) INTO ids;
    END IF;
  ELSE
    ids := NULL;
  END IF;

  payload := json_build_object('t', TG_TABLE_NAME, 'op', left(TG_OP, 1), 'ids', ids)::text;

  -- NOTIFY payloads are capped at ~8 KB. Over the cap, drop the id list and let
  -- the consumer recompute the whole table (FULL-for-table) instead of losing
  -- the change entirely.
  IF octet_length(payload) > 7000 THEN
    payload := json_build_object('t', TG_TABLE_NAME, 'op', left(TG_OP, 1), 'ids', NULL)::text;
  END IF;

  PERFORM pg_notify('live_state', payload);
  RETURN NULL;
END;
$live_state$ LANGUAGE plpgsql;
`;

type TableTrigger = { table: string; pkCol: string };

// Quote a SQL identifier (double-quote, escape embedded double-quotes).
function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

// Single-quote a SQL string literal (for passing the PK column as TG_ARGV[0]).
function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

// Deterministic trigger names so DROP IF EXISTS + CREATE is idempotent across
// boots. One trigger per op so each can declare its own transition table.
function triggerName(table: string, op: "i" | "u" | "d"): string {
  return `live_state_${table}_${op}`;
}

// Every public-schema user table minus the denylist.
async function listPublicTables(db: NodePgDatabase): Promise<string[]> {
  const res = await db.execute<{ relname: string }>(
    drizzleSql.raw(
      `SELECT relname FROM pg_stat_user_tables WHERE schemaname = 'public' ORDER BY relname`,
    ),
  );
  return res.rows
    .map((r) => r.relname)
    .filter((t) => !DENYLIST.has(t));
}

// The single-column primary key of a table, or "" for composite/no PK
// (→ FULL-for-table). Exactly one row from this query ⇒ single-column PK.
async function singleColumnPk(
  db: NodePgDatabase,
  table: string,
): Promise<string> {
  const res = await db.execute<{ attname: string }>(
    drizzleSql.raw(
      `SELECT a.attname
       FROM pg_index i
       JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
       WHERE i.indrelid = format('public.%I', ${quoteLiteral(table)})::regclass
         AND i.indisprimary`,
    ),
  );
  const row = res.rows.length === 1 ? res.rows[0] : undefined;
  return row ? row.attname : "";
}

// Cached at boot during rebuildTriggers — the set of public tables we installed
// triggers on. The listener's on-reconnect FULL sweep iterates this set (see
// listener.ts). It is the by-construction-complete table universe; applyDbChange
// drops any table no resource reads, so sweeping all of them is safe and total.
let coveredTables: string[] = [];

export function getCoveredTables(): readonly string[] {
  return coveredTables;
}

// Rebuilds the entire change-feed trigger layer from source on every boot.
//
// Deterministic, data-less DDL (NOT a migration) — mirrors
// rebuildDerivedViews: enumerate the live schema, then CREATE OR REPLACE the
// function and DROP+CREATE every per-table trigger inside one transaction. Any
// failure throws and blocks boot loudly rather than running with a half-installed
// feed.
//
// `db` is passed in (like rebuildDerivedViews / runMigrations) so this module
// never imports @plugins/database/server — that would cycle (database/server
// calls into the change-feed plugin's onReadyBlocking).
export async function rebuildTriggers(db: NodePgDatabase): Promise<void> {
  const tables = await listPublicTables(db);

  const triggers: TableTrigger[] = [];
  for (const table of tables) {
    triggers.push({ table, pkCol: await singleColumnPk(db, table) });
  }

  await db.transaction(async (tx) => {
    await tx.execute(drizzleSql.raw(NOTIFY_FUNCTION_DDL));

    for (const { table, pkCol } of triggers) {
      const tbl = quoteIdent(table);
      const arg = quoteLiteral(pkCol); // empty string ⇒ FULL-for-table
      const ti = triggerName(table, "i");
      const tu = triggerName(table, "u");
      const td = triggerName(table, "d");

      await tx.execute(
        drizzleSql.raw(`DROP TRIGGER IF EXISTS ${quoteIdent(ti)} ON ${tbl}`),
      );
      await tx.execute(
        drizzleSql.raw(`DROP TRIGGER IF EXISTS ${quoteIdent(tu)} ON ${tbl}`),
      );
      await tx.execute(
        drizzleSql.raw(`DROP TRIGGER IF EXISTS ${quoteIdent(td)} ON ${tbl}`),
      );

      await tx.execute(
        drizzleSql.raw(
          `CREATE TRIGGER ${quoteIdent(ti)} AFTER INSERT ON ${tbl}
           REFERENCING NEW TABLE AS new_rows
           FOR EACH STATEMENT EXECUTE FUNCTION live_state_notify(${arg})`,
        ),
      );
      await tx.execute(
        drizzleSql.raw(
          `CREATE TRIGGER ${quoteIdent(tu)} AFTER UPDATE ON ${tbl}
           REFERENCING NEW TABLE AS new_rows
           FOR EACH STATEMENT EXECUTE FUNCTION live_state_notify(${arg})`,
        ),
      );
      await tx.execute(
        drizzleSql.raw(
          `CREATE TRIGGER ${quoteIdent(td)} AFTER DELETE ON ${tbl}
           REFERENCING OLD TABLE AS old_rows
           FOR EACH STATEMENT EXECUTE FUNCTION live_state_notify(${arg})`,
        ),
      );
    }
  });

  coveredTables = triggers.map((t) => t.table);

  log.publish(
    `[change-feed] installed live_state triggers on ${coveredTables.length} table(s)`,
  );

  await warnOnCoverageGaps(db);
}

// Boot-time coverage check (replaces a separate ./singularity check, which can't
// reach a live DB). After installing triggers, query which public tables (minus
// denylist) lack all three expected triggers and warn loudly on any gap. With
// by-construction coverage this should always be empty; a non-empty result means
// something drifted (a trigger failed to create, or a table appeared between the
// enumerate and the check) and is the loud signal to investigate.
async function warnOnCoverageGaps(db: NodePgDatabase): Promise<void> {
  const tables = await listPublicTables(db);
  const gaps: string[] = [];
  for (const table of tables) {
    const res = await db.execute<{ tgname: string }>(
      drizzleSql.raw(
        `SELECT tgname FROM pg_trigger
         WHERE tgrelid = format('public.%I', ${quoteLiteral(table)})::regclass
           AND NOT tgisinternal
           AND tgname LIKE 'live_state_%'`,
      ),
    );
    const names = new Set(res.rows.map((r) => r.tgname));
    const expected = [
      triggerName(table, "i"),
      triggerName(table, "u"),
      triggerName(table, "d"),
    ];
    if (!expected.every((n) => names.has(n))) gaps.push(table);
  }

  if (gaps.length > 0) {
    log.publish(
      `[change-feed] WARNING: ${gaps.length} public table(s) missing live_state triggers: ${gaps.join(", ")}`,
      "stderr",
    );
  }
}
