import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import type { CliAction } from "@plugins/framework/plugins/cli/core";
import {
  readDatabaseConfig,
  buildConnectionString,
} from "@plugins/database/core";
import { runMigrations } from "@plugins/database/plugins/migrations/server";

const run: CliAction<[], object> = async () => {
  const worktree = process.env.SINGULARITY_WORKTREE;
  if (!worktree) {
    throw new Error("SINGULARITY_WORKTREE env var is required");
  }

  // Open a direct, short-lived connection to the target DB and run the
  // migration runner against it. We do NOT import `db` from
  // @plugins/database/server: that barrel builds its pool at module load and
  // throws without SINGULARITY_WORKTREE. That used to break every other CLI
  // command, because the CLI imported all command modules eagerly; it no longer
  // does — a command's body loads only when that command runs — but the direct
  // connection is still the right shape here, mirroring the migration tooling
  // (plugins/database/plugins/migrations/{drizzle.config.ts,check/*}): the
  // pgbouncer branch is skipped because bootstrap connects straight to
  // Postgres.
  const config = readDatabaseConfig();
  const conn = {
    host: process.env.PGHOST ?? config.connection.host,
    port: Number(process.env.PGPORT ?? config.connection.port),
    user: process.env.PGUSER ?? config.connection.user,
  };
  const pool = new Pool({
    connectionString: buildConnectionString(conn, worktree),
  });
  try {
    await runMigrations(drizzle(pool));
    console.log(`apply-migrations: migrations applied to '${worktree}'.`);
  } finally {
    await pool.end();
  }
  process.exit(0);
};

export default run;
