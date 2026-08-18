export {
  HOME_DIR,
  SINGULARITY_DIR,
  WORKTREES_DIR,
  MAIN_WORKTREE_NAME,
  worktreeDataDir,
  worktreeArtifacts,
  pruneWorktreeBuildArtifacts,
} from "@plugins/infra/plugins/paths/server";

// The database.json path is OWNED by the database plugin's core barrel, which
// also owns the one tolerant reader over it (readDatabaseConfig / libpqEnv).
// Re-exported rather than re-derived: a second `join(SINGULARITY_DIR, …)` here
// is exactly how this module came to host a THIRD, divergent (ENOENT-throwing)
// copy of that reader.
export { DATABASE_CONFIG_PATH } from "@plugins/database/core";

// The cluster's log file, by the SAME rule as the line above. The embedded-PG
// plugin owns the cluster directory (declared as the `services/postgres` data
// dir) and every filename inside it, so this module re-exports rather than
// re-derives.
//
// It used to derive its own `join(SINGULARITY_DIR, "pg")` — a directory that has
// never existed on any machine; the real one has always been `postgres`. Nothing
// caught it because the only consumer is a message: `build`'s readiness error
// says "Check <path> for details", so a wrong path did not fail, it just sent
// whoever hit a startup failure to look at a file that was not there. Two
// spellings of one directory is exactly the drift the re-export prevents.
export { PG_LOG_FILE } from "@plugins/database/plugins/embedded/server";
