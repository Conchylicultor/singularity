// Public tables created imperatively (outside drizzle's tracked schema), so they
// are NOT present in the drizzle snapshot. The `orphaned-db-tables` check treats
// these as declared, and the sites that create them reference these constants so
// the allowlist can never drift from reality.
//
// That last invariant is STATICALLY ENFORCED by the `imperative-create-table-
// allowlisted` check (plugins/database/plugins/migrations/check/): every real-code
// `CREATE TABLE` must name one of the IMPERATIVE_PUBLIC_TABLES constants on its
// line, so an unallowlisted imperative table cannot land at the push gate (the
// DB-side orphaned-db-tables check only catches it later, on a reachable DB). To
// add an imperative table: add its name constant below, include it in the
// IMPERATIVE_PUBLIC_TABLES array, and interpolate that constant on the CREATE
// TABLE line at the create site.
//
// Lives in the derived-views CORE leaf — the shared sink every consumer already
// depends on (migrations → derived-views, change-feed → derived-views,
// database/server → derived-views, and the migrations check). It is deliberately
// NOT in `@plugins/database/core`: importing that from migrations/derived-views
// server code (which `database/server` depends on) would close a cross-plugin
// import cycle. The derived-views core leaf has no such back-edge.
//
// Pure module: no imports that pull in a DB pool, so it stays import-safe for
// tooling/check subprocesses (where SINGULARITY_WORKTREE is unset).

/**
 * Public table created imperatively by the migration runner
 * (`plugins/database/plugins/migrations/server/internal/runner.ts`) — the
 * applied-state ledger keyed by migration hash. Not present in the drizzle
 * snapshot; the orphaned-db-tables check treats it as declared.
 */
export const MIGRATIONS_TABLE_NAME = "__singularity_migrations";

/**
 * Public table created imperatively by the derived-view rebuilder
 * (`plugins/database/plugins/derived-views/server/internal/rebuild.ts`) — holds
 * the derived-view layer's content signature. Not present in the drizzle
 * snapshot; the orphaned-db-tables check treats it as declared.
 */
export const DERIVED_VIEW_STATE_TABLE_NAME = "derived_view_state";

/**
 * The L2 durable change outbox, created imperatively by change-feed inside its
 * trigger-rebuild transaction
 * (`plugins/database/plugins/change-feed/server/internal/triggers.ts`) — the
 * `live_state_notify()` trigger function INSERTs into it on every commit. Not
 * present in the drizzle snapshot; the orphaned-db-tables check treats it as
 * declared.
 */
export const LIVE_STATE_CHANGELOG_TABLE = "live_state_changelog";

/**
 * The L2 persisted live-state materialization, created imperatively by
 * live-state-snapshot
 * (`plugins/database/plugins/live-state-snapshot/server/internal/tables-ddl.ts`)
 * — the durable snapshot + xmin watermark read at cold boot. Not present in the
 * drizzle snapshot; the orphaned-db-tables check treats it as declared.
 */
export const LIVE_STATE_SNAPSHOT_TABLE = "live_state_snapshot";

/**
 * A trigger-maintained materialized rollup ("hand-rolled IVM"): the latest
 * non-system conversation per task, maintained incrementally by STATEMENT
 * triggers on `conversations` and rebuilt from source on boot. Created
 * imperatively inside change-feed's trigger-rebuild transaction
 * (`rebuildDerivedTables`, via the `DerivedTable` contribution in
 * `plugins/conversations/plugins/agents/server/internal/rollup-spec.ts`). Not
 * present in the drizzle snapshot; the orphaned-db-tables check treats it as
 * declared. The constant must appear literally on the `CREATE TABLE` line in
 * that spec (the imperative-create-table-allowlisted check enforces this).
 */
export const TASK_LATEST_CONVERSATION_TABLE = "task_latest_conversation";

/**
 * A trigger-maintained materialized rollup ("hand-rolled IVM"): the per-attempt
 * conversation aggregate (has-conversation / has-live-conversation / max ended_at)
 * backing `attempts_v`, maintained incrementally by STATEMENT triggers on
 * `conversations` and rebuilt from source on boot. Created imperatively by
 * `rebuildDerivedTables` (via the `DerivedTable` contribution in
 * `plugins/tasks/plugins/tasks-core/server/internal/rollup-spec.ts`). Not present
 * in the drizzle snapshot; the orphaned-db-tables check treats it as declared.
 * The constant must appear literally on the `CREATE TABLE` line in that spec (the
 * imperative-create-table-allowlisted check enforces this).
 */
export const ATTEMPT_CONV_AGG_TABLE = "attempt_conv_agg";

/**
 * A trigger-maintained materialized rollup ("hand-rolled IVM"): the per-attempt
 * push aggregate (has-push / min created_at) backing `attempts_v`, maintained
 * incrementally by STATEMENT triggers on `pushes` and rebuilt from source on
 * boot. Created imperatively by `rebuildDerivedTables` (via the `DerivedTable`
 * contribution in `plugins/tasks/plugins/tasks-core/server/internal/rollup-spec.ts`).
 * Not present in the drizzle snapshot; the orphaned-db-tables check treats it as
 * declared. The constant must appear literally on the `CREATE TABLE` line in that
 * spec (the imperative-create-table-allowlisted check enforces this).
 */
export const ATTEMPT_PUSH_AGG_TABLE = "attempt_push_agg";

/**
 * The full allowlist of public tables created imperatively (outside drizzle).
 * The orphaned-db-tables check subtracts these from the live-table set so they
 * are never flagged as orphans.
 */
export const IMPERATIVE_PUBLIC_TABLES: readonly string[] = [
  MIGRATIONS_TABLE_NAME,
  DERIVED_VIEW_STATE_TABLE_NAME,
  LIVE_STATE_CHANGELOG_TABLE,
  LIVE_STATE_SNAPSHOT_TABLE,
  TASK_LATEST_CONVERSATION_TABLE,
  ATTEMPT_CONV_AGG_TABLE,
  ATTEMPT_PUSH_AGG_TABLE,
];
