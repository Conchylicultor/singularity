import type { TimelineEvent, TimelineSource } from "../../../core";

// The per-DB extraction context handed to every DB-backed source. `dbName` is
// the fork DB name, which IS the worktree slug (the main DB "singularity" is
// MAIN_WORKTREE_NAME) — the same identity mapping the slow-ops cluster tab
// relies on.
export interface DbSourceCtx {
  dbName: string;
  isMainDb: boolean;
  fromMs: number; // wall-clock epoch ms
  toMs: number; // wall-clock epoch ms; > fromMs
}

export interface SqlQuery {
  text: string;
  values: unknown[];
}

// One DB-backed timeline source: `build` produces the raw SQL for a DB visit
// and `map` converts the returned rows to normalized events. Both are pure so
// the mapping logic is unit-testable without a database; the fan-out runner
// owns pools, sessions, and error isolation.
//
// A malformed row THROWS out of `map` (zod parse) — the runner's per-source
// try/catch surfaces it as that cell's `ok: false` chunk, mirroring the
// cluster tab's loud-but-resilient pattern.
export interface DbSource {
  source: TimelineSource;
  build: (ctx: DbSourceCtx) => SqlQuery;
  map: (rows: unknown[], ctx: DbSourceCtx) => TimelineEvent[];
}
