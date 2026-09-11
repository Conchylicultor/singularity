import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";
import { AsyncLocalStorage } from "node:async_hooks";
import { EventEmitter } from "node:events";
import net from "node:net";
import { Pool, type PoolClient } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import {
  buildConnectionString,
  readDatabaseConfig,
} from "@plugins/database/core";
import {
  installBackgroundLaneRuntime,
  installSpanContextRuntime,
  readGateGauges,
  recordEntrySpan,
  type EntryContext,
} from "@plugins/infra/plugins/runtime-profiler/core";
import { installQueryWrapper } from "./client";
import {
  AbandonedClientHold,
  QueryDeadlineExceededError,
  abandonClient,
  assertPgPoolInternals,
  queryDeadlineSink,
  withQueryDeadline,
  type QueryDeadlineEvent,
} from "./query-deadline";

// The query deadline against a REAL Postgres, through a black-hole proxy.
//
// The incident this guards (research/2026-09-11-global-live-updates-frozen-by-stray-fd-close.md)
// is a query whose bytes vanish: the socket stays "open" from pg's side, no
// `error`/`end` ever arrives, and the promise waits forever. The proxy below
// reproduces exactly that — a TCP server in front of the cluster whose
// forwarding can be switched off, so bytes are swallowed rather than refused.
//
// No throwaway database: every statement here is table-free (`select 1`,
// `pg_sleep`, a `DO` block), so the suite talks to the always-present `postgres`
// maintenance database. (db-test-fixture is not importable from this plugin: it
// imports `@plugins/database/core` back, which would close an import cycle.)
//
// Requires the running embedded cluster (./singularity build). Unreachable
// cluster ⇒ the first connect throws loudly, never a silent skip.

const DEADLINE_MS = 300;

// The origin class the tx gate reads is ambient: inject the recorder's
// AsyncLocalStorage runtimes exactly as runtime-profiler/server does at boot.
const als = new AsyncLocalStorage<EntryContext>();
installSpanContextRuntime({
  run: (ctx, fn) => als.run(ctx, fn),
  current: () => als.getStore(),
});
const backgroundLaneAls = new AsyncLocalStorage<true>();
installBackgroundLaneRuntime({
  run: (fn) => backgroundLaneAls.run(true, fn),
  active: () => backgroundLaneAls.getStore() === true,
});

// ---------------------------------------------------------------------------
// Black-hole proxy
// ---------------------------------------------------------------------------

interface BlackHoleProxy {
  port: number;
  /** false ⇒ every byte in either direction is silently dropped. */
  setForwarding(on: boolean): void;
  close(): Promise<void>;
}

function upstreamTarget(): net.NetConnectOpts {
  const { connection } = readDatabaseConfig();
  return connection.host.startsWith("/")
    ? { path: `${connection.host}/.s.PGSQL.${connection.port}` }
    : { host: connection.host, port: connection.port };
}

async function startBlackHoleProxy(): Promise<BlackHoleProxy> {
  let forwarding = true;
  const sockets = new Set<net.Socket>();
  const server = net.createServer((down) => {
    const up = net.connect(upstreamTarget());
    sockets.add(down);
    sockets.add(up);
    down.on("data", (chunk) => {
      if (forwarding) up.write(chunk);
    });
    up.on("data", (chunk) => {
      if (forwarding) down.write(chunk);
    });
    const teardown = () => {
      sockets.delete(down);
      sockets.delete(up);
      down.destroy();
      up.destroy();
    };
    down.on("close", teardown);
    up.on("close", teardown);
    down.on("error", teardown);
    up.on("error", teardown);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("proxy has no TCP address");
  return {
    port: address.port,
    setForwarding(on) {
      forwarding = on;
    },
    async close() {
      for (const s of sockets) s.destroy();
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      );
    },
  };
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

let proxy: BlackHoleProxy;

beforeAll(async () => {
  proxy = await startBlackHoleProxy();
});

afterAll(async () => {
  // Tears down every proxied socket, abandoned ones included: each abandoned pg
  // client now gets a real `end` + `error` from its socket. Without the
  // abandon's no-op listeners that `error` is unhandled and fails this run.
  await proxy.close();
  await new Promise((r) => setTimeout(r, 50));
});

interface PgPoolInternals {
  _clients: PoolClient[];
  _idle: { client: PoolClient; timeoutId: unknown }[];
}

function internals(pool: Pool): PgPoolInternals {
  return pool as unknown as PgPoolInternals;
}

interface TestPool {
  pool: Pool;
  /** Every checkout, in order (a pooled client appears once per checkout). */
  acquired: PoolClient[];
  /** Clients whose `end()` was called — an abandoned client must never be one. */
  ended: Set<PoolClient>;
  releases: number;
}

const pools: Pool[] = [];

function createTestPool(
  opts: { wrap?: boolean; idleTimeoutMillis?: number; max?: number } = {},
): TestPool {
  const pool = new Pool({
    connectionString: buildConnectionString(
      {
        host: "127.0.0.1",
        port: proxy.port,
        user: readDatabaseConfig().connection.user,
      },
      "postgres",
    ),
    max: opts.max ?? 4,
    idleTimeoutMillis: opts.idleTimeoutMillis ?? 0,
  });
  const t: TestPool = { pool, acquired: [], ended: new Set(), releases: 0 };
  pool.on("connect", (client) => {
    // `PoolClient`'s type omits `end`; the runtime object is a pg Client.
    const raw = client as unknown as { end: (...args: unknown[]) => unknown };
    const end = raw.end.bind(raw);
    raw.end = (...args) => {
      t.ended.add(client);
      return end(...args);
    };
  });
  pool.on("acquire", (client) => t.acquired.push(client));
  pool.on("release", () => t.releases++);
  if (opts.wrap !== false)
    installQueryWrapper(pool, { deadlineMs: DEADLINE_MS });
  pools.push(pool);
  return t;
}

const events: QueryDeadlineEvent[] = [];

beforeEach(() => {
  events.length = 0;
  queryDeadlineSink.register((event) => events.push(event));
});

afterEach(async () => {
  queryDeadlineSink.register(null);
  proxy.setForwarding(true);
  // Every test releases what it checked out and abandoned clients are no longer
  // the pool's, so end() never waits on a lost statement.
  for (const pool of pools.splice(0)) await pool.end();
});

async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  throw new Error("expected the promise to reject");
}

function asDeadlineError(err: unknown): QueryDeadlineExceededError {
  expect(err).toBeInstanceOf(QueryDeadlineExceededError);
  return err as QueryDeadlineExceededError;
}

function txGauge() {
  const gauge = readGateGauges()["background-tx-acquire"];
  if (!gauge) throw new Error("background-tx-acquire gauge is not registered");
  return gauge;
}

/** Warm one pooled connection so the next checkout costs nothing. */
async function warm(pool: Pool): Promise<void> {
  await pool.query("select 1");
}

// ---------------------------------------------------------------------------
// pg-pool internals pin
// ---------------------------------------------------------------------------

describe("pg-pool internals (pinned: a pg-pool upgrade that moves them fails here)", () => {
  it("abandonClient detaches checked-out and idle clients without ending them", async () => {
    const t = createTestPool({ wrap: false, max: 1, idleTimeoutMillis: 100 });
    const { pool } = t;
    assertPgPoolInternals(pool);
    const hold = new AbandonedClientHold(8);

    // A checked-out client is in `_clients`, not `_idle`.
    const a = await pool.connect();
    expect(internals(pool)._clients).toContain(a);
    expect(pool.totalCount).toBe(1);

    // The pool is full, so the next checkout queues.
    const queued = pool.connect();
    await new Promise((r) => setTimeout(r, 10));
    expect(pool.waitingCount).toBe(1);

    // Abandoning the checked-out client frees its place, and the queued checkout
    // gets a FRESH client right away (the pulse) — not the abandoned one.
    abandonClient(pool, a, hold);
    expect(internals(pool)._clients).not.toContain(a);
    const b = await queued;
    expect(b).not.toBe(a);

    // A released client sits in `_idle` with its idle timer.
    b.release();
    expect(internals(pool)._idle.map((item) => item.client)).toEqual([b]);
    expect(internals(pool)._idle[0]!.timeoutId).toBeDefined();

    // Abandoning an idle client removes it and cancels that timer: past the
    // 100 ms idle timeout, pg-pool never ended it.
    abandonClient(pool, b, hold);
    expect(pool.idleCount).toBe(0);
    expect(pool.totalCount).toBe(0);
    await new Promise((r) => setTimeout(r, 250));
    expect(t.ended.has(a)).toBe(false);
    expect(t.ended.has(b)).toBe(false);

    // Neither has the pool's error listener any more; the abandon's no-op one
    // absorbs a late socket error instead of crashing the process.
    expect(() => a.emit("error", new Error("late socket error"))).not.toThrow();
    expect(() => b.emit("error", new Error("late socket error"))).not.toThrow();
    expect(hold.size).toBe(2);
  });
});

describe("AbandonedClientHold cap", () => {
  it("holds up to the cap, then detaches without holding and emits abandon-cap", () => {
    const clients = [1, 2, 3].map(
      () => new EventEmitter() as unknown as PoolClient,
    );
    let pulses = 0;
    const fakePool = {
      _clients: [...clients],
      _idle: [],
      _pulseQueue: () => {
        pulses++;
      },
    } as unknown as Pool;
    const hold = new AbandonedClientHold(2);

    abandonClient(fakePool, clients[0]!, hold);
    abandonClient(fakePool, clients[1]!, hold);
    expect(events).toEqual([]);

    abandonClient(fakePool, clients[2]!, hold);
    expect(events).toEqual([
      { kind: "abandon-cap", at: expect.any(Number), abandoned: 3, cap: 2 },
    ]);
    expect(hold.size).toBe(2);
    expect(hold.abandoned).toBe(3);
    expect(internals(fakePool)._clients).toEqual([]);
    expect(pulses).toBe(3);

    // Idempotent: a second abandon of the same client does nothing.
    abandonClient(fakePool, clients[2]!, hold);
    expect(events.length).toBe(1);
    expect(hold.abandoned).toBe(3);
    expect(() => clients[2]!.emit("error", new Error("late"))).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// The deadline
// ---------------------------------------------------------------------------

describe("pool.query deadline", () => {
  it("rejects a lost query, abandons its connection, and the next query gets a fresh one", async () => {
    const t = createTestPool();
    const { pool } = t;
    await warm(pool);
    const warmed = t.acquired.at(-1)!;

    proxy.setForwarding(false);
    const t0 = performance.now();
    const err = asDeadlineError(
      await rejectionOf(
        recordEntrySpan("http", "GET /lost", () =>
          pool.query("select 42 as lost"),
        ),
      ),
    );
    const wall = performance.now() - t0;

    expect(wall).toBeGreaterThanOrEqual(DEADLINE_MS - 5);
    expect(wall).toBeLessThan(DEADLINE_MS + 250);
    expect(err.sql).toBe("select 42 as lost");
    expect(err.deadlineMs).toBe(DEADLINE_MS);
    expect(err.elapsedMs).toBeGreaterThanOrEqual(DEADLINE_MS - 5);
    expect(err.origin).toBe("GET /lost");
    expect(err.leased).toBe(false);
    expect(err.reason).toBeNull();
    // No `.code`: the 40P01/40001 retry must never re-run a lost statement.
    expect((err as unknown as { code?: unknown }).code).toBeUndefined();

    // The lost statement ran on the warmed connection, which is now gone from
    // the pool — not ended, not idle, not counted.
    const lost = t.acquired.at(-1)!;
    expect(lost).toBe(warmed);
    expect(internals(pool)._clients).not.toContain(lost);
    expect(internals(pool)._idle.map((i) => i.client)).not.toContain(lost);
    expect(pool.totalCount).toBe(0);
    expect(t.ended.has(lost)).toBe(false);
    expect(() =>
      lost.emit("error", new Error("late socket error")),
    ).not.toThrow();

    // Exactly one emission, carrying the same facts as the error.
    expect(events).toEqual([
      {
        kind: "deadline",
        at: expect.any(Number),
        sql: "select 42 as lost",
        elapsedMs: err.elapsedMs,
        deadlineMs: DEADLINE_MS,
        origin: "GET /lost",
        leased: false,
        reason: null,
      },
    ]);

    // Recovery: the next query builds a new connection and succeeds.
    proxy.setForwarding(true);
    const res = await pool.query<{ ok: number }>("select 1 as ok");
    expect(res.rows).toEqual([{ ok: 1 }]);
    expect(t.acquired.at(-1)).not.toBe(lost);
    expect(pool.totalCount).toBe(1);

    await new Promise((r) => setTimeout(r, DEADLINE_MS));
    expect(events.length).toBe(1);
    expect(t.ended.has(lost)).toBe(false);
  });

  it("keeps one clock across the deadlock retry (a retry never restarts it)", async () => {
    const t = createTestPool();
    const { pool } = t;
    await warm(pool);
    const releasesBefore = t.releases;

    // Attempt 1 burns 200 ms of the 300 ms bound, then fails as a deadlock
    // victim (retried). The moment its connection is released, the proxy goes
    // dark, so attempt 2 is lost. One clock ⇒ expiry ~300 ms after the start;
    // a restarted clock would fire ~200 + 300 = 500 ms after it.
    pool.on("release", () => proxy.setForwarding(false));
    const t0 = performance.now();
    const err = asDeadlineError(
      await rejectionOf(
        pool.query(
          "DO $$ BEGIN PERFORM pg_sleep(0.2); " +
            "RAISE EXCEPTION 'test deadlock victim' USING ERRCODE = '40P01'; END $$",
        ),
      ),
    );
    const wall = performance.now() - t0;

    expect(t.releases - releasesBefore).toBe(1); // attempt 1 handed its connection back
    expect(t.acquired.length).toBe(3); // warm + attempt 1 + attempt 2
    expect(wall).toBeGreaterThanOrEqual(DEADLINE_MS - 5);
    expect(wall).toBeLessThan(DEADLINE_MS + 150);
    expect(err.elapsedMs).toBeLessThan(DEADLINE_MS + 150);
    expect(events.length).toBe(1);
    expect(pool.totalCount).toBe(0);
  });

  it("abandons a slow-but-alive query too, and its late reply never returns it to the pool", async () => {
    const t = createTestPool();
    const { pool } = t;

    const err = asDeadlineError(
      await rejectionOf(pool.query("select pg_sleep(0.5)")),
    );
    expect(err.deadlineMs).toBe(DEADLINE_MS);
    const slow = t.acquired.at(-1)!;

    // The reply lands ~200 ms after the deadline: it resolves a promise nobody
    // awaits, and pg-pool never sees the client again.
    await new Promise((r) => setTimeout(r, 400));
    expect(internals(pool)._clients).not.toContain(slow);
    expect(internals(pool)._idle.map((i) => i.client)).not.toContain(slow);
    expect(t.ended.has(slow)).toBe(false);
    expect(events.length).toBe(1);
  });
});

describe("withQueryDeadline", () => {
  it("extends the bound for its scope", async () => {
    const { pool } = createTestPool();
    const res = await withQueryDeadline(
      { ms: 3_000, reason: "test: long" },
      () => pool.query<{ done: string }>("select pg_sleep(0.5)::text as done"),
    );
    expect(res.rows.length).toBe(1);
    expect(events).toEqual([]);
  });

  it("names its bound and reason on an expiry", async () => {
    const { pool } = createTestPool();
    await warm(pool);
    proxy.setForwarding(false);
    const err = asDeadlineError(
      await rejectionOf(
        withQueryDeadline({ ms: 150, reason: "test: short" }, () =>
          pool.query("select 1"),
        ),
      ),
    );
    expect(err.deadlineMs).toBe(150);
    expect(err.reason).toBe("test: short");
    expect(err.origin).toBeNull(); // context-less, like boot DDL
    expect(events).toMatchObject([
      { kind: "deadline", deadlineMs: 150, reason: "test: short" },
    ]);
  });

  it("rejects a non-positive bound", () => {
    expect(() =>
      withQueryDeadline({ ms: 0, reason: "x" }, async () => 1),
    ).toThrow(RangeError);
  });
});

describe("leased-client deadline (db.transaction)", () => {
  it("rejects a hang inside a background transaction, frees the tx slot, and abandons the client", async () => {
    const t = createTestPool();
    const { pool } = t;
    const tdb = drizzle(pool);
    expect(txGauge().active).toBe(0);

    let slotHeldMidTx = -1;
    const err = asDeadlineError(
      await rejectionOf(
        recordEntrySpan("job", "test.tx-job", () =>
          tdb.transaction(async (tx) => {
            await tx.execute(sql`select 1`);
            slotHeldMidTx = txGauge().active;
            proxy.setForwarding(false);
            await tx.execute(sql`select 2 as lost_in_tx`);
          }),
        ),
      ),
    );

    expect(slotHeldMidTx).toBe(1);
    expect(err.leased).toBe(true);
    expect(err.sql).toBe("select 2 as lost_in_tx");
    expect(err.origin).toBe("test.tx-job");
    // drizzle's ROLLBACK on the poisoned client rejected at once with the SAME
    // error (no second deadline, no second emission), then its argless
    // release() was absorbed — and the gate slot is free.
    expect(txGauge().active).toBe(0);
    expect(events.length).toBe(1);
    expect(events[0]).toMatchObject({
      kind: "deadline",
      leased: true,
      origin: "test.tx-job",
    });

    const leased = t.acquired.at(-1)!;
    expect(internals(pool)._clients).not.toContain(leased);
    expect(internals(pool)._idle.map((i) => i.client)).not.toContain(leased);
    expect(t.ended.has(leased)).toBe(false);
    expect(() =>
      leased.emit("error", new Error("late socket error")),
    ).not.toThrow();

    // The pool recovers: the next background transaction runs on a new client.
    proxy.setForwarding(true);
    const rows = await recordEntrySpan("job", "test.tx-job", () =>
      tdb.transaction(async (tx) => tx.execute(sql`select 3 as ok`)),
    );
    expect(rows.rows).toEqual([{ ok: 3 }]);
    expect(t.acquired.at(-1)).not.toBe(leased);
    expect(txGauge().active).toBe(0);
    expect(events.length).toBe(1);
  });

  it("restores the prototype query on release, so the next holder is not wrapped twice", async () => {
    const t = createTestPool({ max: 1 });
    const { pool } = t;
    const client = await pool.connect();
    expect(Object.prototype.hasOwnProperty.call(client, "query")).toBe(true);
    await client.query("select 1");
    client.release();
    expect(Object.prototype.hasOwnProperty.call(client, "query")).toBe(false);
    // The same pooled client serves the query path next, unwrapped and working.
    await pool.query("select 1");
    expect(t.acquired.at(-1)).toBe(client);
  });
});
