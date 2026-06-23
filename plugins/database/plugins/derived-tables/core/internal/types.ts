// A `DerivedRollupSpec` is a trigger-maintained materialized rollup table — a
// "hand-rolled IVM" (incrementally-maintained materialized view) for an
// aggregate too expensive to recompute from scratch on every live-state poll,
// yet not expressible as a plain derived view.
//
// Like a derived view, a rollup is DERIVED state: fully recomputable from its
// source tables, created imperatively on boot (NOT a drizzle migration), and
// kept current by STATEMENT-level triggers on the source. The boot reconcile is
// the self-healing safety net (heals any drift from downtime / bulk loads).
//
// The registry is deliberately THIN: opaque SQL strings only, no query-builder
// abstraction over the rollup shape. The generic layer (derived-tables/server)
// only orchestrates "create table → create function → create triggers →
// reconcile" from these strings; each contributor owns its concrete SQL. A
// second rollup registers with zero edits to the generic layer.
//
// Pure module: no DB import, so it stays import-safe for tooling/check
// subprocesses (where SINGULARITY_WORKTREE is unset).
export type DerivedRollupSpec = {
  // The rollup table's SQL name. Used both as the create target and as the
  // feed-exempt key (the change-feed never installs a NOTIFY trigger on a
  // rollup — it is a pure read-cache fed by the source's own change, not an
  // independent write surface).
  table: string;
  // `CREATE TABLE IF NOT EXISTS <table> (...)`. Idempotent.
  createDdl: string;
  // `CREATE OR REPLACE FUNCTION ...` — the maintenance function the triggers
  // call. Deterministic, data-less DDL, recreated on every boot.
  functionDdl: string;
  // The per-op `CREATE TRIGGER` statements (DROP IF EXISTS + CREATE), as one
  // opaque SQL string. May contain multiple statements separated by `;`.
  triggerDdl: string;
  // The idempotent full rebuild from source (boot reconcile / self-heal). Runs
  // after table + function + triggers exist. Should be guarded so a
  // pre-migration fresh-DB boot no-ops instead of erroring.
  reconcileDdl: string;
};
