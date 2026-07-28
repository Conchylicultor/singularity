import { join } from "node:path";
import { SINGULARITY_DIR } from "@plugins/infra/plugins/paths/server";

export { HOME_DIR, SINGULARITY_DIR, WORKTREES_DIR, MAIN_WORKTREE_NAME, worktreeDataDir, worktreeArtifacts, pruneWorktreeBuildArtifacts } from "@plugins/infra/plugins/paths/server";

// The database.json path is OWNED by the database plugin's core barrel, which
// also owns the one tolerant reader over it (readDatabaseConfig / libpqEnv).
// Re-exported rather than re-derived: a second `join(SINGULARITY_DIR, …)` here
// is exactly how this module came to host a THIRD, divergent (ENOENT-throwing)
// copy of that reader.
export { DATABASE_CONFIG_PATH } from "@plugins/database/core";

export const PG_DIR               = join(SINGULARITY_DIR, "pg");
export const PG_DATA_DIR          = join(PG_DIR, "data");
export const PG_LOG_FILE          = join(PG_DIR, "postgres.log");
