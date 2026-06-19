import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { retryUntil, exponential } from "@plugins/packages/plugins/retry/core";
import { createSemaphore } from "@plugins/packages/plugins/semaphore/core";
import { recordSpan, chargeWait, currentCallerKind } from "@plugins/infra/plugins/runtime-profiler/core";
import { readDatabaseConfig, buildConnectionString } from "@plugins/database/core";

// The worktree name is the worktree DB name — the one thing the worktree pool
// genuinely needs. The throw is deferred to first use (building the pool's
// connection string) rather than run at module load, so admin-only importers
// that never touch the worktree pool stay import-safe. It is still loud and
// never silently defaulted.
function requireWorktree(): string {
  const worktree = process.env.SINGULARITY_WORKTREE;
  if (!worktree) {
    throw new Error("SINGULARITY_WORKTREE env var is required");
  }
  return worktree;
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

const POOL_MAX = 16;

const pool = new Pool({
  connectionString: buildConnectionString(conn, requireWorktree()),
  max: POOL_MAX,
  idleTimeoutMillis: 20_000,
});

// The one concurrency gate, at the only place the scarce resource is consumed.
// Of the pool's `max` connections, RESERVED_INTERACTIVE are always kept free for
// interactive (HTTP/mutation) work; the rest is the ceiling for background/loader
// queries. A live-state cascade flush can fire ~10 dependent loaders in one
// microtask; gating here (rather than around whole loader bodies) means an
// in-memory loader that issues no query never waits, and a loader holds a slot
// only for the duration of one query — so cheap loaders stop being
// head-of-line-blocked behind DB/git work, and background load can never starve
// interactive work of connections. Gating by caller kind (read from the
// profiler's ambient context) needs no cost-class hints: the gate measures the
// real scarce thing — held connections — so a loader that doesn't query isn't
// counted. See research/2026-06-19-global-live-state-unified-read-path-v2.md
// (Task 2) and research/2026-06-15-global-live-state-cascade-contention.md.
const RESERVED_INTERACTIVE = 6;
const loaderDbGate = createSemaphore(POOL_MAX - RESERVED_INTERACTIVE);

// Time every query that flows through pool.query (all drizzle ORM queries).
// The promise form is reimplemented to split the two phases that node-postgres
// Pool.query collapses internally — connection acquisition (pool queue-wait +
// pgbouncer backend establishment) and query execution — into two separate
// spans:
//   - "[acquire]" : time to check out a live connection. At cold boot this is
//                   where the multi-second cost lives; once warm it's sub-ms.
//   - "<sql text>": pure execution time on an already-acquired client.
// Before this split, the single "db" span lumped acquisition into execution, so
// a trivial PK lookup could read as multi-second right after a restart. The
// callback form is passed straight through to origQuery untouched (drizzle never
// uses it). Direct pool.connect() → client.query paths still bypass timing —
// see plugins/database/CLAUDE.md.
//
// Loader-originated queries (caller kind === "loader") additionally route
// through `loaderDbGate`, so background load caps at POOL_MAX - RESERVED_INTERACTIVE
// concurrent connections and interactive work keeps reserved capacity. The gate
// wait is CHARGED to the enclosing loader entry (via chargeWait) under the
// "loader-acquire" layer, so the wait lands on the waiting resource's own span
// (work = total − Σwaits, lock-vs-work readable directly) instead of in a
// label-shared `db [loader-acquire]` bucket. The caller kind is read
// synchronously, before any await, so the profiler's ambient context is still
// active. The pool's own `[acquire]` (connect) and `<sql>` (execute) leaf spans
// stay — those are real per-query measurements, not gate waits.
const origQuery = pool.query.bind(pool);
const origConnect = pool.connect.bind(pool);
// biome-ignore lint/suspicious/noExplicitAny: pass-through wrapper over pg's overloaded query signature.
pool.query = ((...a: Parameters<typeof origQuery>): any => {
  const last = a[a.length - 1];
  if (typeof last === "function") return origQuery(...a); // callback form, untimed + ungated

  const first = a[0] as string | { text?: string } | undefined;
  const text = typeof first === "string" ? first : (first?.text ?? "?");

  const runTimed = async () => {
    const acq0 = performance.now();
    const client = await origConnect(); // unwrapped: avoids double-recording
    recordSpan("db", "[acquire]", performance.now() - acq0);
    try {
      const exec0 = performance.now();
      // biome-ignore lint/suspicious/noExplicitAny: proxy pg's overloaded query.
      const res = await (client.query as any)(...a);
      recordSpan("db", text, performance.now() - exec0);
      return res;
    } finally {
      client.release();
    }
  };

  // Gate only background/loader queries; interactive (http) and context-less
  // (jobs/migrations/pollers) queries run ungated against the reserved capacity.
  if (currentCallerKind() === "loader") {
    return loaderDbGate.run(runTimed, (waitMs) =>
      chargeWait("loader-acquire", waitMs),
    );
  }
  return runTimed();
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

// Eagerly open and validate connections up to the pool's `max` so the first
// real-query wave (the onReady thundering herd + the frontend's first loaders)
// hits live connections instead of paying connection-establishment cost. The
// SELECT 1 on each forces pgbouncer to attach a backend now, not on the first
// user query. node-postgres `min` does NOT pre-connect — it only avoids
// destroying idle connections — so this explicit warm step is required. Called
// from the database plugin's onReady, after awaitDbReady() and before migrations
// and any other plugin's onReady. awaitDbReady() leaves 1 connection idle, so we
// only open the remainder; self-healing if `max` is small (e.g. 1 in tests).
export async function warmPool(): Promise<void> {
  const target = pool.options.max ?? 5;
  const need = target - pool.idleCount;
  if (need <= 0) return;
  const clients = await Promise.all(
    Array.from({ length: need }, () => pool.connect()),
  );
  await Promise.all(clients.map((c) => c.query("SELECT 1")));
  for (const c of clients) c.release();
}
