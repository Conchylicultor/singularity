import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import type { CliAction } from "@plugins/framework/plugins/cli/core";
import {
  readDatabaseConfig,
  buildConnectionString,
} from "@plugins/database/core";
import { runMigrations } from "@plugins/database/plugins/migrations/server";
import { asNamespace } from "@plugins/infra/plugins/namespace/core";
import {
  REPO_ROOT,
  checkoutNamespace,
} from "@plugins/infra/plugins/paths/core";

const run: CliAction<[], { namespace?: string }> = async (opts) => {
  // Stated, or minted from the checkout this command is standing in. Never read
  // from the environment: the ambient value answered `singularity` from every
  // worktree, so a hand-run bootstrap silently migrated MAIN's database.
  const worktree =
    opts.namespace === undefined
      ? await checkoutNamespace(REPO_ROOT)
      : asNamespace(opts.namespace);

  // Open a direct, short-lived connection to the target DB and run the
  // migration runner against it. We do NOT import `db` from
  // @plugins/database/server: that barrel's worktree pool is scoped to this
  // process's RUNTIME namespace, which a CLI process does not have — and which
  // would be the wrong question anyway, since the namespace to migrate is an
  // argument here. The direct connection also mirrors the migration tooling
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
