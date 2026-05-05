import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { retryUntil, exponential } from "@packages/retry";
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

// Errors that mean "PG isn't reachable yet; retry shortly":
//  - 57P03 — SQLSTATE "the database system is starting up", emitted while
//    the cluster is in WAL recovery or just after central re-spawned PG.
//  - ENOENT — Unix socket file doesn't exist yet (central hasn't bound it).
//  - ECONNREFUSED — TCP listener not up yet (system-PG escape hatch).
// Everything else (auth failure, syntax error, …) bubbles up so we don't
// mask real bugs.
export function isTransientPgError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; errno?: string };
  const code = e.code ?? e.errno;
  return code === "57P03" || code === "ENOENT" || code === "ECONNREFUSED";
}

const PG_READY_TIMEOUT_MS = 30_000;
let readyPromise: Promise<void> | null = null;

// Wait for PG to be reachable before issuing the first real query. Per-worktree
// backends spawn in parallel with central at gateway startup, so the first
// connect can race PG's bind; central can also be unhealthy / mid-restart when
// a backend boots. Without this loop, the backend hard-crashes with ENOENT or
// ECONNREFUSED instead of waiting the few hundred ms for central to come up.
export async function awaitPgReady(): Promise<void> {
  if (readyPromise) return readyPromise;
  readyPromise = (async () => {
    let lastErr: unknown = null;
    await retryUntil(
      async () => {
        try {
          const client = await pool.connect();
          try {
            await client.query("SELECT 1");
            return true;
          } finally {
            client.release();
          }
        } catch (err) {
          if (!isTransientPgError(err)) throw err;
          lastErr = err;
          return null;
        }
      },
      {
        delay: exponential({ initial: 100, max: 1_000 }),
        deadline: PG_READY_TIMEOUT_MS,
        onDeadline: () => {
          throw new Error(
            `Postgres did not become reachable within ${PG_READY_TIMEOUT_MS}ms`,
            { cause: lastErr },
          );
        },
      },
    );
  })();
  return readyPromise;
}
