// Test-only import shim. `@plugins/database/server` throws at module eval without
// a worktree name (it builds the pool's connection string eagerly). These unit
// tests always inject a fake `db` and never issue a real query, so a placeholder
// worktree name makes the transitive import safe — node-postgres pools connect
// lazily, so no connection is ever opened. Import this FIRST in each test file,
// before `./compile` (which statically imports the real `db`).
process.env.SINGULARITY_WORKTREE ??= "query-resource-test";
export {};
