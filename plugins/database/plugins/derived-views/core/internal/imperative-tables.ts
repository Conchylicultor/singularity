// Public tables created imperatively (outside drizzle's tracked schema), so they
// are NOT present in the drizzle snapshot. The `orphaned-db-tables` check treats
// these as declared, and the sites that create them reference these constants so
// the allowlist can never drift from reality.
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
 * The full allowlist of public tables created imperatively (outside drizzle).
 * The orphaned-db-tables check subtracts these from the live-table set so they
 * are never flagged as orphans.
 */
export const IMPERATIVE_PUBLIC_TABLES: readonly string[] = [
  MIGRATIONS_TABLE_NAME,
  DERIVED_VIEW_STATE_TABLE_NAME,
];
