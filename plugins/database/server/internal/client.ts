import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { retryUntil, exponential, withJitter } from "@plugins/packages/plugins/retry/core";
import { createSemaphore } from "@plugins/packages/plugins/semaphore/core";
import { recordSpan, chargeWait, currentCallerKind, recordReadTables, registerGateGauge } from "@plugins/infra/plugins/runtime-profiler/core";
import { Log } from "@plugins/primitives/plugins/log-channels/server";
import { readDatabaseConfig, buildConnectionString } from "@plugins/database/core";

// The worktree name is the worktree DB name — the one thing the worktree pool
// genuinely needs. The throw is deferred to first use (the lazy `pool()` build,
// triggered by the first real query/connection) rather than run at module load,
// so this module is import-safe: admin-only importers that never touch the
// worktree pool, and unit tests that inject a fake `db` and never issue a query,
// both import it without a worktree. It is still loud and never silently
// defaulted — a real query without `SINGULARITY_WORKTREE` throws here.
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

// Occupancy gauges for the flight recorder's gate snapshot: layer names join to
// the corresponding `chargeWait` layers in span `waits`. `loader-acquire` is the
// loader gate itself; `db-pool` is the gauge for the `db-acquire` wait layer —
// occupancy of the raw pg pool (held connections + queued checkouts), not the
// loader gate. pg.Pool's totalCount/idleCount/waitingCount are free property reads.
// Both gauges register at module load; `db-pool` reads the pool lazily and reports
// an empty occupancy until the pool is first built (no worktree touched to sample).
registerGateGauge("loader-acquire", () => loaderDbGate.stats());
registerGateGauge("db-pool", () => {
  const p = poolSingleton;
  if (!p) return { active: 0, queued: 0, max: POOL_MAX };
  return {
    active: p.totalCount - p.idleCount,
    queued: p.waitingCount,
    max: POOL_MAX,
  };
});

// Extract the table read-set from compiled SQL by matching quoted identifiers
// after FROM / JOIN / INTO / UPDATE / DELETE FROM. Drizzle always double-quotes
// table identifiers, so this is reliable for ORM queries; raw sql`` and CTE
// aliases fall to coarse over-capture, which is acceptable for this read-set.
function extractTablesFromSql(text: string): string[] {
  const re = /\b(?:from|join|into|update|delete\s+from)\s+"([^"]+)"/gi;
  const tables = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) tables.add(m[1]!);
  return Array.from(tables);
}

// Postgres deadlock-victim (40P01) and serialization-failure (40001) are, by
// definition, retryable: the conflicting statement was rolled back whole and
// holds nothing. pool.query only ever runs a single autocommit statement
// (explicit transactions go through pool.connect() → client.query and bypass
// this wrapper — see plugins/database/CLAUDE.md), so a fresh re-execution is
// always safe and correct: there is no partial-transaction state to lose. The
// concrete victim this absorbs is the derived-views boot rebuild, which holds a
// brief AccessExclusive window over its views (DROP+CREATE in one tx) — during a
// hot-swap restart that window used to kill concurrent readers on the previous
// backend (the tasks loader, the allow-files poll) with a hard "deadlock
// detected" crash. Bounded jittered retry rides out the window instead of
// surfacing it; a genuinely persistent deadlock still throws after the cap, so a
// real lock-order bug stays loud.
const RETRYABLE_SQLSTATES = new Set(["40P01", "40001"]);
const MAX_QUERY_RETRIES = 4;
const queryRetryDelay = withJitter(exponential({ initial: 10, max: 250 }));

// Every retry is logged, persistently. The retry self-heals transient contention
// (DDL vs reads) but is NOT silent: a recurring deadlock — e.g. a genuine
// lock-order bug — surfaces here as a steady stream of lines even while it keeps
// succeeding within the cap, instead of vanishing. Grep `db.jsonl` for
// `[deadlock-retry]`; a rising rate is the signal to fix the source, not the cap.
const dbLog = Log.channel("db", { persist: true });

function retryableSqlState(err: unknown): string | null {
  if (!err || typeof err !== "object") return null;
  const code = (err as { code?: string }).code ?? "";
  return RETRYABLE_SQLSTATES.has(code) ? code : null;
}

// Install the timing/gating wrapper onto a freshly-built pool's `query`. Called
// exactly once, from `pool()`, so the wrapper is bound to the same pool instance
// `db` and `awaitDbReady`/`warmPool` use. See the block comment on each concern.
function installQueryWrapper(pool: Pool): void {
  const origQuery = pool.query.bind(pool);
  const origConnect = pool.connect.bind(pool);

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
  // biome-ignore lint/suspicious/noExplicitAny: pass-through wrapper over pg's overloaded query signature.
  pool.query = ((...a: Parameters<typeof origQuery>): any => {
    const last = a[a.length - 1];
    if (typeof last === "function") return origQuery(...a); // callback form, untimed + ungated

    const first = a[0] as string | { text?: string } | undefined;
    const text = typeof first === "string" ? first : (first?.text ?? "?");

    const runOnce = async () => {
      const acq0 = performance.now();
      const client = await origConnect(); // unwrapped: avoids double-recording
      const acqMs = performance.now() - acq0;
      // The leaf "[acquire]" span keeps rate visibility; the chargeWait ALSO
      // lands the same duration in the enclosing entry's waits ("db-acquire"
      // layer), so the caller's wall-clock decomposition sums instead of the
      // connect-wait hiding inside a label-shared leaf bucket.
      recordSpan("db", "[acquire]", acqMs);
      chargeWait("db-acquire", acqMs);
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

    // Re-run the statement (fresh connection each attempt) on a deadlock/
    // serialization victim; non-retryable errors propagate immediately, and the
    // attempt cap re-throws a persistent conflict so it never loops forever.
    const runTimed = () =>
      retryUntil(
        async (attempt) => {
          try {
            return await runOnce();
          } catch (err) {
            const sqlstate = retryableSqlState(err);
            // Non-retryable errors, and a retryable one that has exhausted the cap,
            // propagate — a persistent deadlock still crashes loudly.
            if (sqlstate === null || attempt >= MAX_QUERY_RETRIES) throw err;
            dbLog.publish(
              `[deadlock-retry] sqlstate=${sqlstate} attempt=${attempt + 1}/${MAX_QUERY_RETRIES} sql=${text.slice(0, 160)}`,
              "stderr",
            );
            return null; // retryable victim — back off and retry
          }
        },
        { delay: queryRetryDelay },
      );

    // Gate only background/loader queries; interactive (http) and context-less
    // (jobs/migrations/pollers) queries run ungated against the reserved capacity.
    if (currentCallerKind() === "loader") {
      // Capture the loader's table read-set into its ambient entry context (still
      // active here, before the gated promise). Observation-only — does not affect
      // timing or gating.
      recordReadTables(extractTablesFromSql(text));
      return loaderDbGate.run(runTimed, (waitMs) =>
        chargeWait("loader-acquire", waitMs),
      );
    }
    return runTimed();
  }) as typeof pool.query;
}

// Lazily-constructed singleton pool. Importing this module never builds a pool or
// reads SINGULARITY_WORKTREE; the worktree name is required only when the first
// real query/connection is issued (`pool()` → `requireWorktree()`). node-postgres
// pools connect lazily, so building the pool opens no connection either — the warm
// step in `warmPool()` does that explicitly at boot.
let poolSingleton: Pool | null = null;

function pool(): Pool {
  if (poolSingleton) return poolSingleton;
  const p = new Pool({
    connectionString: buildConnectionString(conn, requireWorktree()),
    max: POOL_MAX,
    idleTimeoutMillis: 20_000,
  });
  installQueryWrapper(p);
  poolSingleton = p;
  return p;
}

// Lazily-built real drizzle instance over the real per-worktree pool. Kept behind
// `db` (a forwarding Proxy) so that: (a) importing this module builds nothing —
// the pool is created on the first `db.<method>()` call, not at eval; and (b) the
// underlying client is a genuine `pg.Pool`, which drizzle's session requires
// (`this.client instanceof Pool`) to open a dedicated connection for
// `db.transaction()`. A faked/proxied pool would silently break transactions.
// Derive the type from the concrete `drizzle(pool())` call (not `ReturnType<typeof
// drizzle>`, which resolves to the broad variadic overload) so `db` keeps the exact
// `NodePgDatabase<Record<string, never>>` type the original eager `drizzle(pool)`
// produced — consumers are typed against it.
function buildDb() {
  return drizzle(pool());
}
type DrizzleDb = ReturnType<typeof buildDb>;
let dbSingleton: DrizzleDb | null = null;

function realDb(): DrizzleDb {
  if (!dbSingleton) dbSingleton = buildDb();
  return dbSingleton;
}

// Bound-method cache: `realDb()` is a stable singleton once built, so each method
// need bind only once. Non-function properties (e.g. `db.query` RQB namespace,
// `db.$client`) forward straight through.
const boundMethods = new Map<PropertyKey, unknown>();

export const db: DrizzleDb = new Proxy({} as DrizzleDb, {
  get(_target, prop) {
    const real = realDb() as unknown as Record<PropertyKey, unknown>;
    const value = real[prop];
    if (typeof value !== "function") return value;
    let bound = boundMethods.get(prop);
    if (bound === undefined) {
      bound = (value as (...args: unknown[]) => unknown).bind(real);
      boundMethods.set(prop, bound);
    }
    return bound;
  },
});

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
          const client = await pool().connect();
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
  const p = pool();
  const target = p.options.max ?? 5;
  const need = target - p.idleCount;
  if (need <= 0) return;
  const clients = await Promise.all(
    Array.from({ length: need }, () => p.connect()),
  );
  await Promise.all(clients.map((c) => c.query("SELECT 1")));
  for (const c of clients) c.release();
}
