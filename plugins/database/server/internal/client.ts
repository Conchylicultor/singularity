import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolClient } from "pg";
import { retryUntil, exponential, withJitter } from "@plugins/packages/plugins/retry/core";
import { createSemaphore } from "@plugins/packages/plugins/semaphore/core";
import { recordSpan, chargeWait, currentCallerKind, currentOriginClass, recordReadTables, registerGateGauge } from "@plugins/infra/plugins/runtime-profiler/core";
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

export const POOL_MAX = 16;

// The concurrency gates, at the only place the scarce resource is consumed.
//
// Of the pool's `max` connections, RESERVED_INTERACTIVE are always kept free for
// interactive work; the rest is the ceiling for background work. The partition
// is by ORIGIN CLASS — the lane of the outermost entry that triggered the query
// (`currentOriginClass()`), not the kind of the innermost one. Inside a resource
// load the innermost kind is `loader` regardless of *why* the load runs, so a
// caller-kind gate cannot tell a human's cold sub-ack load from a cascade
// recompute and queues the human behind hundreds of machine recomputes. Origin
// class can. See research/2026-07-09-global-interactive-lane-under-load.md.
//
// Gating at the query (rather than around whole loader bodies) means an
// in-memory loader that issues no query never waits, and a query holds a slot
// only for its own duration — the gate measures the real scarce thing, held
// connections, so cheap loaders stop being head-of-line-blocked behind DB work.
// See research/2026-06-19-global-live-state-unified-read-path-v2.md (Task 2) and
// research/2026-06-15-global-live-state-cascade-contention.md.
//
// TWO background gates, not one, and the split is a deadlock proof rather than a
// tuning knob. A background transaction (`pool.connect()` → `client.query`, the
// path drizzle's `db.transaction()` takes) holds a pool connection for its whole
// life and may `await` a plain `pool.query` inside its callback. Under ONE shared
// background gate, N transactions each holding a slot while awaiting a slot for
// their inner query deadlock the background lane permanently — the classic
// hold-and-wait cycle. Under two, the wait-for graph is acyclic by construction:
//
//     bg-tx → bg-query → pool connection → {interactive, boot}
//
// and the terminal holders always complete. Concretely: bg-tx holders pin at most
// BACKGROUND_TX_MAX connections and bg-query holders at most BACKGROUND_QUERY_MAX,
// so as long as
//
//     BACKGROUND_TX_MAX + BACKGROUND_QUERY_MAX ≤ POOL_MAX − RESERVED_INTERACTIVE
//
// at least RESERVED_INTERACTIVE connections always remain free — the bg-query
// holders can therefore always finish and release the slots the transactions are
// waiting on, and no cycle can close. That inequality IS the proof, so it is
// asserted below at module load rather than left in prose.
// Exported for co-located unit testing: the deadlock proof is an arithmetic
// relation between these four, so the test asserts the relation rather than
// re-deriving the numbers.
export const RESERVED_INTERACTIVE = 6;
const BACKGROUND_MAX = POOL_MAX - RESERVED_INTERACTIVE;
export const BACKGROUND_TX_MAX = 3;
export const BACKGROUND_QUERY_MAX = BACKGROUND_MAX - BACKGROUND_TX_MAX;

if (BACKGROUND_TX_MAX + BACKGROUND_QUERY_MAX > POOL_MAX - RESERVED_INTERACTIVE) {
  throw new Error(
    `DB lane invariant violated: BACKGROUND_TX_MAX (${BACKGROUND_TX_MAX}) + ` +
      `BACKGROUND_QUERY_MAX (${BACKGROUND_QUERY_MAX}) exceeds POOL_MAX (${POOL_MAX}) - ` +
      `RESERVED_INTERACTIVE (${RESERVED_INTERACTIVE}). The background lane can deadlock: ` +
      `a transaction holding a connection can wait forever for a query slot that never frees.`,
  );
}

const backgroundQueryGate = createSemaphore(BACKGROUND_QUERY_MAX);
const backgroundTxGate = createSemaphore(BACKGROUND_TX_MAX);

// Occupancy gauges for the flight recorder's gate snapshot: layer names join to
// the corresponding `chargeWait` layers in span `waits`. `background-acquire` is
// the background query gate and `background-tx-acquire` the background
// transaction gate; `db-pool` is the gauge for the `db-acquire` wait layer —
// occupancy of the raw pg pool (held connections + queued checkouts), not either
// gate. pg.Pool's totalCount/idleCount/waitingCount are free property reads.
//
// `background-acquire` is the former `loader-acquire`, renamed with the gate's
// semantics: the gate no longer means "a loader is querying" — jobs, flush's own
// direct queries, and the observability writes all charge to it now, while a
// loader running under a `sub` origin does not. Keeping the old name would make
// every trace lie about who is queueing.
registerGateGauge("background-acquire", () => backgroundQueryGate.stats());
registerGateGauge("background-tx-acquire", () => backgroundTxGate.stats());
registerGateGauge("db-pool", () => {
  const p = poolSingleton;
  if (!p) return { active: 0, queued: 0, max: POOL_MAX };
  return {
    active: p.totalCount - p.idleCount,
    queued: p.waitingCount,
    max: POOL_MAX,
  };
});

// A loader's read-set contains ONLY the tables it READS — matched from the read
// clauses FROM / JOIN. Write targets (INSERT INTO / UPDATE / DELETE) are
// deliberately excluded: loaders are read-only by contract, so any write captured
// under a loader's ambient context is a foreign observability leak (e.g. the
// report path's `INSERT INTO "notifications"` running inside whatever loader
// happened to be open), never a genuine read dependency. Drizzle always
// double-quotes table identifiers, so this is reliable for ORM reads; raw sql``
// and CTE aliases fall to coarse over-capture, which is acceptable for this
// read-set. Exported for co-located unit testing.
//
// `DELETE FROM` reuses the `FROM` keyword, so we capture the leading clause
// keyword and skip a `delete from` match — otherwise a delete's write target
// would slip in through the bare `from` branch. `INSERT INTO` / `UPDATE` targets
// never follow FROM/JOIN, so no such guard is needed for them.
export function extractReadTablesFromSql(text: string): string[] {
  const re = /\b(from|join|delete\s+from)\s+"([^"]+)"/gi;
  const tables = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m[1]!.toLowerCase().startsWith("delete")) continue; // write target, not a read
    tables.add(m[2]!);
  }
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

// Install the timing/gating wrapper onto a freshly-built pool's `query` and
// `connect`. Called exactly once, from `pool()`, so the wrapper is bound to the
// same pool instance `db` and `awaitDbReady`/`warmPool` use. See the block
// comment on each concern. Exported for co-located unit testing: the invariants
// it enforces (lane partition, tx lease accounting) are testable against a fake
// `pg.Pool`-shaped object, with no database.
export function installQueryWrapper(pool: Pool): void {
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
  // Background-origin queries additionally route through `backgroundQueryGate`, so
  // background query load caps at BACKGROUND_QUERY_MAX concurrent connections and
  // interactive work keeps reserved capacity. The gate wait is CHARGED to the
  // enclosing entry (via chargeWait) under the "background-acquire" layer, so the
  // wait lands on the waiting resource's own span (work = total − Σwaits,
  // lock-vs-work readable directly) instead of in a label-shared
  // `db [background-acquire]` bucket. The origin class is read synchronously,
  // before any await, so the profiler's ambient context is still active. The
  // pool's own `[acquire]` (connect) and `<sql>` (execute) leaf spans stay —
  // those are real per-query measurements, not gate waits.
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

    // Read-set capture is keyed on the CALLER kind and is orthogonal to the lane:
    // only a `loader` entry has a read-set (the tables its resource depends on),
    // and it has one whether a human or the cascade is driving it. A `cascade`
    // entry's reads are deliberately not captured — they are edge
    // (ids-translation) reads, not the downstream resource's value dependencies,
    // so indexing them would raise a false silent-FULL flag (see the
    // resource-runtime cascade). Observation-only: affects neither timing nor
    // gating.
    if (currentCallerKind() === "loader") {
      recordReadTables(extractReadTablesFromSql(text));
    }

    // Gate by ORIGIN class, not caller kind. What changes versus the old
    // `callerKind === "loader" | "cascade"` condition:
    //   - a `sub`-origin loader query is now UNGATED — a human's cold pane load no
    //     longer queues FIFO behind hundreds of cascade recomputes (Gap A);
    //   - a `job`-origin query is now GATED — graphile jobs are background by
    //     nature and used to run against the reserved floor (Gap C);
    //   - a `flush` entry's own DIRECT queries are now GATED — caller kind
    //     `"flush"` matched neither arm of the old condition, so the flush cycle's
    //     own reads slipped through the gate they exist to sit behind.
    // Interactive stays UNGATED, matching today's `http` semantics: it is already
    // bounded upstream by `readLoadGate` (READ_LOAD_CONCURRENCY = 6,
    // resource-runtime/core/runtime.ts:906) for cold reads and by per-route
    // endpoint concurrency gates for mutations, and adding a third bound here
    // would only re-serialize the lane we are trying to keep free.
    // Context-less work (boot, migrations, `warmPool`, the change-feed listener)
    // has no ambient entry and stays UNGATED, so boot can never deadlock on a gate.
    if (currentOriginClass() === "background") {
      return backgroundQueryGate.run(runTimed, (waitMs) =>
        chargeWait("background-acquire", waitMs),
      );
    }
    return runTimed();
  }) as typeof pool.query;

  // Gate background TRANSACTIONS. `pool.connect()` hands out a raw pooled client
  // that bypasses the `pool.query` wrapper entirely — no timing, no lane gate,
  // and (until now) no reservation. It is the path drizzle's `db.transaction()`
  // takes (`NodePgSession` does `await this.client.connect()` when
  // `client instanceof Pool`, which is why `db` must keep proxying a real
  // `pg.Pool`). Under event-loop lag a transaction holds its connection across
  // every `await` continuation, so inflated background transactions ate all 16
  // connections *including the reserved 6* — this bypass is what turned the
  // 2026-07-09 afternoon incident from slow into unusable.
  //
  // The gate is a LEASE, not a scope: the slot is taken when the client is handed
  // out and freed when the caller releases it, because that is exactly the window
  // in which the connection is pinned. `origConnect` was captured above, before
  // this override, and `runOnce` calls it — so a query-path checkout is charged to
  // the query gate only and is never double-gated here.
  // biome-ignore lint/suspicious/noExplicitAny: pass-through wrapper over pg's overloaded connect signature.
  pool.connect = ((...a: Parameters<typeof origConnect>): any => {
    // Callback form — untouched, exactly like `pool.query`'s. Nothing in the repo
    // uses it; pg's own internals may.
    if (typeof a[0] === "function") return origConnect(...a);

    // Read the lane synchronously, before any await, while the ambient entry
    // context is still the caller's. Interactive checkouts (HTTP mutations) and
    // context-less ones (`awaitDbReady`, `warmPool`) pass straight through: the
    // former are allowed the reserved floor, and the latter must never be able to
    // wait on a gate at boot.
    if (currentOriginClass() !== "background") return origConnect();

    return (async (): Promise<PoolClient> => {
      const releaseSlot = await backgroundTxGate.acquire((waitMs) =>
        chargeWait("background-tx-acquire", waitMs),
      );
      let client: PoolClient;
      try {
        client = await origConnect();
      } catch (err) {
        // The checkout failed, so nothing will ever call `release()` on a client
        // we never got. Hand the slot back before rethrowing, or the gate leaks a
        // slot per failed connect and eventually wedges the background lane shut.
        releaseSlot();
        throw err;
      }

      // pg assigns `release` per checkout as an own property, so patching it here
      // affects only this lease. The `released` guard makes the slot free exactly
      // once: pg throws on a double release, and a second `releaseSlot()` would
      // hand back a slot this lease never held, pushing occupancy past the cap and
      // silently voiding the gate. The second call still reaches pg's own release
      // so its double-release error stays loud. `err` and the return value are
      // forwarded unchanged — pg's `release(err?: Error | boolean)` destroys the
      // connection rather than returning it when `err` is truthy, and swallowing
      // that argument would quietly return a poisoned connection to the pool.
      const origRelease = client.release.bind(client);
      let released = false;
      client.release = (err?: Error | boolean): void => {
        if (released) return origRelease(err);
        released = true;
        try {
          return origRelease(err);
        } finally {
          releaseSlot();
        }
      };
      return client;
    })();
  }) as typeof pool.connect;
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
