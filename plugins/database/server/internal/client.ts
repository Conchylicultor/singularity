import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { retryUntil, exponential } from "@plugins/packages/plugins/retry/core";
import { recordSpan } from "@plugins/infra/plugins/runtime-profiler/core";
import { readDatabaseConfig, buildConnectionString } from "@plugins/database/core";

const worktree = process.env.SINGULARITY_WORKTREE;
if (!worktree) {
  throw new Error("SINGULARITY_WORKTREE env var is required");
}

const config = readDatabaseConfig();
const conn = config.pgbouncer
  ? {
      host: config.pgbouncer.host,
      port: config.pgbouncer.port,
      user: config.connection.user,
    }
  : {
      host: process.env.PGHOST ?? config.connection.host,
      port: Number(process.env.PGPORT ?? config.connection.port),
      user: process.env.PGUSER ?? config.connection.user,
    };

const pool = new Pool({
  connectionString: buildConnectionString(conn, worktree),
  max: 5,
  idleTimeoutMillis: 20_000,
});

// Time every query that flows through pool.query (all drizzle ORM queries + the
// awaitDbReady SELECT 1). Only the promise form is timed; the callback form is
// passed through untouched. Direct pool.connect() → client.query paths bypass
// this — see plugins/database/CLAUDE.md.
const origQuery = pool.query.bind(pool);
// biome-ignore lint/suspicious/noExplicitAny: pass-through wrapper over pg's overloaded query signature.
pool.query = ((...a: Parameters<typeof origQuery>): any => {
  const first = a[0] as string | { text?: string } | undefined;
  const text = typeof first === "string" ? first : (first?.text ?? "?");
  const t0 = performance.now();
  // pg's overloaded query() can be typed as returning void (callback form), so
  // widen to unknown before the thenable check.
  const r: unknown = origQuery(...a);
  if (r && typeof (r as Promise<unknown>).finally === "function") {
    return (r as Promise<unknown>).finally(() =>
      recordSpan("db", text, performance.now() - t0),
    );
  }
  return r;
}) as typeof pool.query;

export const db = drizzle(pool);

export function isTransientDbError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; errno?: string };
  const code = e.code ?? e.errno;
  return code === "57P03" || code === "ENOENT" || code === "ECONNREFUSED";
}

const PG_READY_TIMEOUT_MS = 30_000;
let readyPromise: Promise<void> | null = null;

export async function awaitDbReady(): Promise<void> {
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
          if (!isTransientDbError(err)) throw err;
          lastErr = err;
          return null;
        }
      },
      {
        delay: exponential({ initial: 100, max: 1_000 }),
        deadline: PG_READY_TIMEOUT_MS,
        onDeadline: () => {
          throw new Error(
            `Database did not become reachable within ${PG_READY_TIMEOUT_MS}ms`,
            { cause: lastErr },
          );
        },
      },
    );
  })();
  return readyPromise;
}
