import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import {
  EMBEDDED_PG_PORT,
  EMBEDDED_PG_SOCKET_DIR,
  EMBEDDED_PG_USER,
} from "../embedded-pg-defaults";

const worktree = process.env.SINGULARITY_WORKTREE;
if (!worktree) {
  throw new Error("SINGULARITY_WORKTREE env var is required");
}

// Default: connect to the embedded Postgres cluster managed by central
// (see `plugins/infra/plugins/database/`). Escape hatch: setting
// `SINGULARITY_USE_SYSTEM_PG=1` reverts to the previous PGHOST/PGPORT
// behavior so users can keep their own system Postgres.
const useSystemPg = process.env.SINGULARITY_USE_SYSTEM_PG === "1";

const host = useSystemPg
  ? (process.env.PGHOST ?? "localhost")
  : (process.env.PGHOST ?? EMBEDDED_PG_SOCKET_DIR);
const port = useSystemPg
  ? (process.env.PGPORT ?? "5432")
  : (process.env.PGPORT ?? EMBEDDED_PG_PORT);
const user = useSystemPg
  ? (process.env.PGUSER ?? process.env.USER ?? "postgres")
  : (process.env.PGUSER ?? EMBEDDED_PG_USER);

// libpq treats hosts starting with "/" as a Unix socket directory and
// ignores the `port` for the TCP sense — but the port still selects which
// `.s.PGSQL.<port>` socket file to open in that directory.
function buildConnString(database: string): string {
  if (host.startsWith("/")) {
    return `postgres://${user}@/${database}?host=${encodeURIComponent(host)}&port=${port}`;
  }
  return `postgres://${user}@${host}:${port}/${database}`;
}

export const connectionString = buildConnString(worktree);

export const pool = new Pool({
  connectionString,
  max: 5,
  idleTimeoutMillis: 20_000,
});
export const db = drizzle(pool);

export const adminPool = new Pool({
  connectionString: buildConnString("postgres"),
  max: 1,
  idleTimeoutMillis: 20_000,
});

// Short-lived pool against a named database. Used by db-fork to run
// per-db cleanup (e.g. dropping a schema) without going through the
// long-lived, per-worktree `pool`.
export function openShortLivedClient(dbName: string): Pool {
  return new Pool({
    connectionString: buildConnString(dbName),
    max: 1,
    idleTimeoutMillis: 1_000,
  });
}

/**
 * Env block to pass to libpq subprocesses (`pg_dump`, `pg_restore`, `psql`)
 * so they connect to the same instance the pools point at. Always sets
 * absolute values so subprocesses don't inherit a stray PGHOST that points
 * elsewhere.
 */
export const libpqSubprocessEnv: Record<string, string> = {
  PGHOST: host,
  PGPORT: port,
  PGUSER: user,
};
