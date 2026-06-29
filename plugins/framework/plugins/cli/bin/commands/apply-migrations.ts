import type { Command } from "commander";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { readDatabaseConfig, buildConnectionString } from "@plugins/database/core";
import { runMigrations } from "@plugins/database/plugins/migrations/server";

export function registerApplyMigrations(program: Command) {
  program
    .command("apply-migrations")
    .description(
      "Apply pending SQL migrations to the DB selected by SINGULARITY_WORKTREE. " +
        "Used by the fresh-clone bootstrap (mise `setup`) to seed the base " +
        "'singularity' DB before the first build; the server otherwise applies " +
        "migrations itself on boot.",
    )
    .action(async () => {
      const worktree = process.env.SINGULARITY_WORKTREE;
      if (!worktree) {
        throw new Error("SINGULARITY_WORKTREE env var is required");
      }

      // Open a direct, short-lived connection to the target DB and run the
      // migration runner against it. We do NOT import `db` from
      // @plugins/database/server: that barrel builds its pool at module load and
      // throws without SINGULARITY_WORKTREE, which would break every other CLI
      // command (bin/index.ts imports all command modules eagerly). This mirrors
      // the direct-connection shape of the migration tooling
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
    });
}
