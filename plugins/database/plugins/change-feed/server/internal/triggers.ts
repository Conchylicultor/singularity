import { createHash } from "node:crypto";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { sql as drizzleSql } from "drizzle-orm";
import { retryUntil, exponential, withJitter } from "@plugins/packages/plugins/retry/core";
import {
  MIGRATIONS_TABLE_NAME,
  LIVE_STATE_CHANGELOG_TABLE,
  LIVE_STATE_SNAPSHOT_TABLE,
  LIVE_STATE_TRIGGER_STATE_TABLE,
} from "@plugins/database/plugins/derived-views/core";
import { feedExemptTables } from "@plugins/database/plugins/derived-tables/server";
import { excludedTableNames } from "./exclusion";
import { changeFeedLog as log } from "./log-sink";

// Infrastructure tables the change-feed must NEVER trigger on — its own plumbing,
// independent of any feature plugin's opt-out. Keep this minimal.
//
// We exclude the migrations bookkeeping table — written by the migration runner
// inside `onReadyBlocking`, never read by a live-state loader, so triggering on it
// adds pure noise. graphile_worker lives in its own schema, so it is already
// excluded by the public-schema filter.
//
// `live_state_changelog` and `live_state_snapshot` (the L2 persisted-
// materialization tables) are denylisted because `live_state_notify()` writes the
// changelog from inside every trigger — a trigger ON the changelog would recurse
// infinitely (each INSERT firing the trigger that does another INSERT). The
// snapshot table is written by the runtime persist hook (out of band of any
// trigger) and read only at boot, so it never needs a feed either.
//
// The table-name constants live in the derived-views core leaf (the imperative-
// public-table allowlist) so the orphaned-db-tables check and the create sites
// share one source — see that module.
// `feedExemptTables()` adds the trigger-maintained materialized rollup tables
// (derived-tables contributions): a rollup is a pure read-cache fed by its
// source's change, never an independent write surface — a NOTIFY trigger on it
// would double-route the source change through the rollup's id space and defeat
// the correctly-scoped source-driven recompute. `excludedTableNames()` adds the
// tables a feature plugin opted out via the `ExcludeFromChangeFeed` contribution
// (e.g. high-churn observability counters) — keeping THIS plugin from naming any
// consumer table (collection-consumer separation). Both are built at CALL time
// (not module load) so the contribution sets are read after collectContributions
// has run, the same way rebuildDerivedViews reads View.getContributions() lazily.
// `live_state_trigger_state` (this layer's own content signature — see
// `rebuildTriggers`) is denylisted for the same reason as the snapshot table: it
// is written only by the rebuild itself and read only at boot, so it is pure
// plumbing no live-state loader ever reads. Triggering on it would also make the
// rebuild's own signature write re-enter the feed.
function buildDenylist(): Set<string> {
  return new Set<string>([
    MIGRATIONS_TABLE_NAME,
    LIVE_STATE_CHANGELOG_TABLE,
    LIVE_STATE_SNAPSHOT_TABLE,
    LIVE_STATE_TRIGGER_STATE_TABLE,
    ...feedExemptTables(),
    ...excludedTableNames(),
  ]);
}

// L2 durable outbox DDL. Created INSIDE rebuildTriggers' transaction, before the
// trigger function is (re)defined, so the table the function INSERTs into is
// guaranteed to exist before any data-change trigger can fire. Derived-state
// table (CREATE TABLE IF NOT EXISTS on boot, like __singularity_derived_view_state)
// — NOT a drizzle migration. See
// research/2026-06-22-global-live-state-l2-persisted-materialization.md §3.1.
//
//  - `seq` is a stable ordering / prune key only (NOT the watermark).
//  - `xid` is `pg_current_xact_id()` — the 64-bit xid8, stored as numeric so it
//    never overflows signed bigint near 2^63. NEVER the 32-bit txid_* forms.
//  - `ids` is the changed PKs, or NULL (bulk / pk-less / over-cap → FULL on catch-up).
const CHANGELOG_TABLE_DDL = `
CREATE TABLE IF NOT EXISTS ${LIVE_STATE_CHANGELOG_TABLE} (
  seq        bigserial PRIMARY KEY,
  xid        numeric   NOT NULL,
  t          text      NOT NULL,
  op         char(1)   NOT NULL,
  ids        text[],
  at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS live_state_changelog_xid_idx ON ${LIVE_STATE_CHANGELOG_TABLE} (xid);
`;

// Create the L2 durable outbox table if it does not already exist. Extracted so
// production (rebuildTriggers, passing its own `tx`) and the DB-backed test
// harness share ONE DDL source — mirroring `ensureSnapshotTable(db)` in
// live-state-snapshot. A drizzle transaction `tx` is assignable to
// `NodePgDatabase` for `.execute`, so callers can pass either the pool-backed db
// or a live transaction.
export async function ensureChangelogTable(db: NodePgDatabase): Promise<void> {
  await db.execute(drizzleSql.raw(CHANGELOG_TABLE_DDL));
}

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
  has_rows boolean;
BEGIN
  -- A statement that touched zero rows changed no data — e.g. an
  -- INSERT … ON CONFLICT DO NOTHING that fully conflicted, or an UPDATE/DELETE
  -- matching no rows. The STATEMENT-level trigger still fires once; suppress it
  -- here so a no-op statement never drives a (FULL-for-table) live-state
  -- recompute. This cannot drop a real invalidation: no affected row ⇒ no data
  -- change ⇒ nothing for the consumer to recompute or for catch-up to replay.
  -- (EXECUTE — not a static reference — because new_rows/old_rows only exist for
  -- the matching TG_OP, mirroring the dynamic array_agg below.)
  IF TG_OP = 'DELETE' THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM old_rows)' INTO has_rows;
  ELSE
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM new_rows)' INTO has_rows;
  END IF;
  IF NOT has_rows THEN
    RETURN NULL;
  END IF;

  IF pk_col IS NOT NULL AND pk_col <> '' THEN
    IF TG_OP = 'DELETE' THEN
      EXECUTE format('SELECT array_agg(%I::text) FROM old_rows', pk_col) INTO ids;
    ELSE
      EXECUTE format('SELECT array_agg(%I::text) FROM new_rows', pk_col) INTO ids;
    END IF;
  ELSE
    ids := NULL;
  END IF;

  -- 'x' is the source transaction id (pg_current_xact_id(), the same xid8 the
  -- changelog row below stores) — the mutation-ack attribution the live-state
  -- runtime threads onto its recompute frames (ackTx). Kept on the over-cap
  -- re-emit too: dropping the ids degrades scope, not attribution.
  payload := json_build_object('t', TG_TABLE_NAME, 'op', left(TG_OP, 1), 'ids', ids, 'x', pg_current_xact_id()::text)::text;

  -- NOTIFY payloads are capped at ~8 KB. Over the cap, drop the id list and let
  -- the consumer recompute the whole table (FULL-for-table) instead of losing
  -- the change entirely. The same over-cap rule applies to the durable changelog
  -- row below (NULL ids → FULL on catch-up), so re-derive ids once here.
  IF octet_length(payload) > 7000 THEN
    ids := NULL;
    payload := json_build_object('t', TG_TABLE_NAME, 'op', left(TG_OP, 1), 'ids', NULL, 'x', pg_current_xact_id()::text)::text;
  END IF;

  PERFORM pg_notify('live_state', payload);

  -- L2 durable outbox: write a transactional changelog row alongside the
  -- ephemeral NOTIFY. Because this INSERT runs inside the same trigger/txn as the
  -- data change, the changelog row commits ATOMICALLY with the write (a
  -- rolled-back write leaves no changelog row). The xid is the 64-bit xid8 via
  -- pg_current_xact_id() — the same family as the watermark the runtime captures
  -- (pg_snapshot_xmin) — so the catch-up replay predicate (xid >= position) is
  -- never under-replayed. See
  -- research/2026-06-22-global-live-state-l2-persisted-materialization.md §3.1.
  INSERT INTO live_state_changelog (xid, t, op, ids)
  VALUES (pg_current_xact_id()::text::numeric, TG_TABLE_NAME, left(TG_OP, 1), ids);

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

// Every public-schema user table minus the exclusion set (infra denylist ∪
// derived-table rollups ∪ feature-contributed `ExcludeFromChangeFeed` tables).
// The caller passes the set (built once via `buildDenylist()`) so the same
// snapshot drives table enumeration, the stale-trigger drop, and the coverage
// check within one rebuild.
async function listPublicTables(
  db: NodePgDatabase,
  exclude: Set<string>,
): Promise<string[]> {
  const res = await db.execute<{ relname: string }>(
    drizzleSql.raw(
      `SELECT relname FROM pg_stat_user_tables WHERE schemaname = 'public' ORDER BY relname`,
    ),
  );
  return res.rows
    .map((r) => r.relname)
    .filter((t) => !exclude.has(t));
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

// The statements that install one table's feed: a DROP IF EXISTS + CREATE per op,
// so the pair is idempotent across boots. Compiled once and used for BOTH
// execution and the content signature, so the fingerprint can never drift from the
// SQL we actually emit — change this template and every table's signature changes,
// forcing the rebuild that the change requires (mirrors derived-views compiling
// `compileCreateView` once and hashing that same string).
function compileTableTriggerDdl(table: string, pkCol: string): string[] {
  const tbl = quoteIdent(table);
  const arg = quoteLiteral(pkCol); // empty string ⇒ FULL-for-table
  const ti = triggerName(table, "i");
  const tu = triggerName(table, "u");
  const td = triggerName(table, "d");
  return [
    `DROP TRIGGER IF EXISTS ${quoteIdent(ti)} ON ${tbl}`,
    `DROP TRIGGER IF EXISTS ${quoteIdent(tu)} ON ${tbl}`,
    `DROP TRIGGER IF EXISTS ${quoteIdent(td)} ON ${tbl}`,
    `CREATE TRIGGER ${quoteIdent(ti)} AFTER INSERT ON ${tbl}
           REFERENCING NEW TABLE AS new_rows
           FOR EACH STATEMENT EXECUTE FUNCTION live_state_notify(${arg})`,
    `CREATE TRIGGER ${quoteIdent(tu)} AFTER UPDATE ON ${tbl}
           REFERENCING NEW TABLE AS new_rows
           FOR EACH STATEMENT EXECUTE FUNCTION live_state_notify(${arg})`,
    `CREATE TRIGGER ${quoteIdent(td)} AFTER DELETE ON ${tbl}
           REFERENCING OLD TABLE AS old_rows
           FOR EACH STATEMENT EXECUTE FUNCTION live_state_notify(${arg})`,
  ];
}

type CompiledTable = { table: string; stmts: string[] };

// Bookkeeping for the trigger layer's content signature — the exact twin of
// derived-views' `derived_view_state`, created idempotently here (not via a
// migration) because, like the triggers it tracks, it is derived-layer state, not
// schema in the migration chain. It lives in the DB so a worktree fork carries the
// signature with its triggers (`CREATE DATABASE … TEMPLATE` copies the row),
// avoiding a spurious first-boot rebuild on every fork.
const TRIGGER_STATE_DDL = `
CREATE TABLE IF NOT EXISTS "public"."${LIVE_STATE_TRIGGER_STATE_TABLE}" (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  signature text NOT NULL
)`;

// A deadlock/serialization victim is by definition retryable: Postgres rolled the
// whole transaction back, so it holds nothing and a fresh re-run has no partial
// state to lose — the same argument `pool.query`'s retry makes in
// database/server/internal/client.ts. It is repeated HERE because
// `db.transaction()` takes the `pool.connect()` → `client.query` path, which
// bypasses that wrapper entirely (the leak documented in plugins/database/CLAUDE.md)
// — which is exactly why a deadlocked rebuild killed boot instead of retrying.
// Bounded and logged: a persistent conflict still throws and blocks boot loudly.
const RETRYABLE_SQLSTATES = new Set(["40P01", "40001"]);
const MAX_REBUILD_RETRIES = 4;
const rebuildRetryDelay = withJitter(exponential({ initial: 50, max: 1_000 }));

type TxCallback = Parameters<NodePgDatabase["transaction"]>[0];

async function runRebuildTx(db: NodePgDatabase, fn: TxCallback): Promise<void> {
  await retryUntil(
    async (attempt) => {
      try {
        await db.transaction(fn);
        return true;
      } catch (err) {
        const code = (err as { code?: string } | null)?.code ?? "";
        if (!RETRYABLE_SQLSTATES.has(code) || attempt >= MAX_REBUILD_RETRIES) throw err;
        log.publish(
          `[change-feed] [deadlock-retry] sqlstate=${code} attempt=${attempt + 1}/${MAX_REBUILD_RETRIES} — retrying trigger rebuild`,
          "stderr",
        );
        return null; // retryable victim — back off and retry the whole rebuild
      }
    },
    { delay: rebuildRetryDelay },
  );
}

// Cached at boot during rebuildTriggers — the set of public tables we installed
// triggers on. The listener's on-reconnect FULL sweep iterates this set (see
// listener.ts). It is the by-construction-complete table universe; applyDbChange
// drops any table no resource reads, so sweeping all of them is safe and total.
//
// Set from the DESIRED set on every boot, including the skip-when-unchanged path
// (where "desired" is proven to equal "installed") — `assertScopePoliciesCovered`
// reads it via `getCoveredTables()` immediately after, so it must be populated
// whether or not we rebuilt.
let coveredTables: string[] = [];

export function getCoveredTables(): readonly string[] {
  return coveredTables;
}

// Rebuilds the entire change-feed trigger layer from source.
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
//
// SKIP WHEN UNCHANGED — mirrors the identical fix in rebuildDerivedViews, whose
// header comment describes the same failure. `DROP+CREATE TRIGGER` takes an
// AccessExclusive lock on its table until commit, and this rebuild does that for
// EVERY public table in ONE transaction — so mid-rebuild it holds an exclusive
// lock on a large, alphabetically-ordered prefix of the database while still
// asking for more. That is textbook hold-and-wait, and during a hot-swap restart
// it runs against a DB that is anything but quiet: the PREVIOUS backend is still
// serving reads (the swap is ready-gated), and this hook races the database
// plugin's own onReadyBlocking (migrations → rollup reconcile → view rebuild)
// under Promise.all with no topo order. Any of those readers that touches two
// tables in the opposite order closes a cycle, and Postgres shoots one session:
// when the victim is THIS transaction, the exception escapes onReadyBlocking, the
// backend exits before ready, and the deploy fails with the old code still live.
// Build build-1784288281433-w62dep died exactly this way (attempts ⇄
// conversations, SQLSTATE 40P01).
//
// The trigger layer is a pure function of (schema, denylist, emitted DDL), so we
// fingerprint the compiled DDL and skip the rebuild entirely when it matches
// what is already live — taking ZERO table locks on the steady-state restart
// path, which is the overwhelming majority of boots (a frontend-only commit, as
// that build was, changes no triggers at all). The lock window — and the deadlock
// risk that comes with it — now only opens on a genuine schema/denylist change,
// and `runRebuildTx` rides out a victim there rather than killing boot.
export async function rebuildTriggers(db: NodePgDatabase): Promise<void> {
  // Infra plumbing + derived-table rollups + feature `ExcludeFromChangeFeed`
  // opt-outs, all unioned (contributions collected by the framework before this
  // onReadyBlocking hook runs). One snapshot drives enumeration, the stale-trigger
  // drop below, and the coverage check.
  const exclude = buildDenylist();
  const optedOut = excludedTableNames();
  if (optedOut.size > 0) {
    log.publish(
      `[change-feed] ${optedOut.size} table(s) opted out of the feed via ExcludeFromChangeFeed: ${[...optedOut].sort().join(", ")}`,
    );
  }

  const tables = await listPublicTables(db, exclude);

  const triggers: TableTrigger[] = [];
  for (const table of tables) {
    triggers.push({ table, pkCol: await singleColumnPk(db, table) });
  }

  // Compile once — this is both what we execute below and what we fingerprint.
  const compiled: CompiledTable[] = triggers.map(({ table, pkCol }) => ({
    table,
    stmts: compileTableTriggerDdl(table, pkCol),
  }));

  // Content signature of the whole trigger layer: the shared function DDL plus
  // every table's compiled statements, in enumeration order (listPublicTables
  // already ORDER BYs, so the order is stable across boots). Identical signature
  // ⇒ identical feed ⇒ nothing to do.
  const signature = createHash("sha256")
    .update(
      [NOTIFY_FUNCTION_DDL, ...compiled.map((c) => `${c.table}\n${c.stmts.join("\n")}`)].join(
        "\n--\n",
      ),
    )
    .digest("hex");

  // Populated on BOTH paths — assertScopePoliciesCovered reads it right after.
  coveredTables = triggers.map((t) => t.table);

  if (await triggerLayerUpToDate(db, signature, compiled, exclude)) {
    log.publish(
      `[change-feed] up to date (${coveredTables.length} table(s), signature unchanged) — skipping rebuild`,
    );
    // The up-to-date check just PROVED every expected trigger is installed, which
    // is the same property warnOnCoverageGaps queries for — so the coverage sweep
    // below would be a guaranteed-empty re-verification. Skip it too.
    return;
  }

  await runRebuildTx(db, async (tx) => {
    // L2: the changelog the trigger function INSERTs into MUST exist before the
    // function is defined and before any per-table trigger that fires it. Create
    // it first, inside this same transaction — `onReadyBlocking` hooks run in
    // parallel, so the live-state-snapshot plugin's own boot ordering can't be
    // relied on for this (it owns the snapshot table; change-feed owns the
    // changelog because change-feed writes it).
    await ensureChangelogTable(tx);

    await tx.execute(drizzleSql.raw(NOTIFY_FUNCTION_DDL));

    // Drop any live_state_* triggers lingering on a now-excluded table — e.g. a
    // table that had a feed on prior boots and was just opted out via
    // ExcludeFromChangeFeed. Catalog-driven (find-then-drop by name) so it names
    // no specific table and self-heals a rename/drift, mirroring how the rest of
    // this layer is rebuilt from the live schema rather than tracked.
    if (exclude.size > 0) {
      const existing = await tx.execute<{ tgname: string; relname: string }>(
        drizzleSql.raw(
          `SELECT t.tgname, c.relname
           FROM pg_trigger t
           JOIN pg_class c ON c.oid = t.tgrelid
           JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public'
             AND NOT t.tgisinternal
             AND t.tgname LIKE 'live_state_%'`,
        ),
      );
      for (const { tgname, relname } of existing.rows) {
        if (!exclude.has(relname)) continue;
        await tx.execute(
          drizzleSql.raw(
            `DROP TRIGGER IF EXISTS ${quoteIdent(tgname)} ON ${quoteIdent(relname)}`,
          ),
        );
      }
    }

    for (const { stmts } of compiled) {
      for (const stmt of stmts) {
        await tx.execute(drizzleSql.raw(stmt));
      }
    }

    // Stamp the signature LAST, inside the same transaction: a rolled-back rebuild
    // leaves no signature row, so a failed boot can never mark the layer current
    // and skip a rebuild it never finished.
    await tx.execute(drizzleSql.raw(TRIGGER_STATE_DDL));
    await tx.execute(
      drizzleSql`
        INSERT INTO "public".${drizzleSql.raw(`"${LIVE_STATE_TRIGGER_STATE_TABLE}"`)} (id, signature)
        VALUES (true, ${signature})
        ON CONFLICT (id) DO UPDATE SET signature = EXCLUDED.signature
      `,
    );
  });

  coveredTables = triggers.map((t) => t.table);

  log.publish(
    `[change-feed] installed live_state triggers on ${coveredTables.length} table(s)`,
  );

  await warnOnCoverageGaps(db, exclude);
}

// True iff the live trigger layer already IS the desired one, so the rebuild (and
// its whole-database exclusive-lock window) can be skipped entirely.
//
// The stored signature alone is not trusted — it only says "the last rebuild that
// committed emitted this DDL". Everything it asserts about the CURRENT database is
// re-verified from the catalog, so anything dropped out of band (a manual DROP
// TRIGGER, a restored dump, a half-cleaned fork) falls through to a real rebuild:
// this mirrors derived-views' `allPresent` guard, widened to the three objects
// this layer owns. Reads only catalogs + the signature row — no user-table locks,
// which is the entire point.
async function triggerLayerUpToDate(
  db: NodePgDatabase,
  signature: string,
  compiled: CompiledTable[],
  exclude: Set<string>,
): Promise<boolean> {
  await db.execute(drizzleSql.raw(TRIGGER_STATE_DDL));

  const priorRes = await db.execute<{ signature: string }>(
    drizzleSql.raw(
      `SELECT signature FROM "public"."${LIVE_STATE_TRIGGER_STATE_TABLE}" LIMIT 1`,
    ),
  );
  if (priorRes.rows[0]?.signature !== signature) return false;

  // The trigger function and the changelog table it INSERTs into must both still
  // exist — a trigger whose function vanished would fire and error on every write.
  const objRes = await db.execute<{ fn: string | null; changelog: string | null }>(
    drizzleSql.raw(
      `SELECT to_regproc('public.live_state_notify')::text        AS fn,
              to_regclass('public.${LIVE_STATE_CHANGELOG_TABLE}')::text AS changelog`,
    ),
  );
  const objs = objRes.rows[0];
  if (!objs?.fn || !objs.changelog) return false;

  // Every expected trigger is physically present, and no live_state_* trigger
  // lingers on a now-excluded table (the stale-drop case the rebuild handles).
  const installedRes = await db.execute<{ tgname: string; relname: string }>(
    drizzleSql.raw(
      `SELECT t.tgname, c.relname
       FROM pg_trigger t
       JOIN pg_class c ON c.oid = t.tgrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public'
         AND NOT t.tgisinternal
         AND t.tgname LIKE 'live_state_%'`,
    ),
  );
  if (installedRes.rows.some((r) => exclude.has(r.relname))) return false;

  const installed = new Set(installedRes.rows.map((r) => r.tgname));
  return compiled.every((c) =>
    (["i", "u", "d"] as const).every((op) => installed.has(triggerName(c.table, op))),
  );
}

// Boot-time coverage check (replaces a separate ./singularity check, which can't
// reach a live DB). After installing triggers, query which public tables (minus
// denylist) lack all three expected triggers and warn loudly on any gap. With
// by-construction coverage this should always be empty; a non-empty result means
// something drifted (a trigger failed to create, or a table appeared between the
// enumerate and the check) and is the loud signal to investigate.
async function warnOnCoverageGaps(
  db: NodePgDatabase,
  exclude: Set<string>,
): Promise<void> {
  const tables = await listPublicTables(db, exclude);
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
