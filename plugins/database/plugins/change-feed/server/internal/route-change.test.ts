import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { z } from "zod";
import {
  defineResource,
  notificationsWsHandler,
  recordLoaderReadSet,
  type ResourceParams,
} from "@plugins/framework/plugins/server-core/core";
import { mintRoutePlan } from "@plugins/framework/plugins/resource-runtime/core";
import {
  createTestDb,
  type TestDb,
} from "@plugins/database/plugins/db-test-fixture/server/testing";
import { createChangeFeedListener } from "./listener";
import { routeChange } from "./route-change";
import { rebuildTriggers } from "./triggers";

// `routeChange` is the ONLY production path from a table change into the live
// runtime: the LISTEN consumer, the L2 catch-up and the reconnect sweep all call
// it. It feeds two routers — `routeTableChange` serves the ROUTED entries (every
// collection window, `:rows` and `:groups`), `applyDbChange` every other one —
// and each entry must be reached through exactly one of them. The runtime suites
// drive the two routers by hand, so this suite drives the real `routeChange`
// into the real server-core runtime: with it, a `routeChange` that stopped
// calling a router, or passed a name no route states, fails here instead of
// silently freezing every collection at its hydrated value.
//
// The second half runs the whole feed on a throwaway database: a real trigger,
// the real listener, `routeChange`, and a delta on the wire.
//
// Requires a running Postgres cluster (started by ./singularity build) for the
// feed half; createTestDb() throws loudly when it is unreachable.

const RowSchema = z.object({ id: z.string(), n: z.number() });
type Row = z.infer<typeof RowSchema>;

interface Frame {
  kind: string;
  key?: string;
  params?: ResourceParams;
  value?: unknown;
  upserts?: [string, Row][];
  ackTx?: string[];
}

/** A point tuple's ids (`{ ids: "a,b" }`). */
const idsOf = (params: ResourceParams): string[] =>
  (params.ids ?? "").split(",").filter((id) => id !== "");

interface Load {
  key: string;
  ids: readonly string[] | "FULL";
}

/**
 * One keyed point resource over `table`, registered on the server-core runtime
 * — ROUTED (one identity route, compiler-shaped) or LEGACY (an `identityTable`,
 * reached through the read-set inversion).
 */
function pointResource(
  key: string,
  table: string,
  kind: "routed" | "legacy",
  read: (ids: readonly string[]) => Promise<Row[]> | Row[],
  loads: Load[],
): void {
  const contract = {
    key,
    schema: z.array(RowSchema),
    keyed: { keyOf: (row: unknown) => (row as Row).id },
    validateParams: () => {},
  };
  const membership = { kind: "point" as const, idsOf };
  const loader = (
    params: ResourceParams,
    ctx?: { affectedIds: readonly string[] },
  ) => {
    loads.push({ key, ids: ctx ? [...ctx.affectedIds] : "FULL" });
    return read(ctx?.affectedIds ?? idsOf(params));
  };
  if (kind === "routed") {
    defineResource(contract, {
      routes: mintRoutePlan({
        routes: [
          {
            id: "base",
            table,
            map: { kind: "identity" },
            columns: ["id", "n"],
          },
        ],
        usesOf: () => new Map([["base", { role: "membership" as const }]]),
      }),
      membership,
      loader,
    });
  } else {
    defineResource(contract, { identityTable: table, membership, loader });
  }
}

/** A socket on the server-core runtime, recording every frame. */
function attach() {
  const frames: Frame[] = [];
  const handler = notificationsWsHandler as unknown as {
    open(ws: unknown): void;
    message(ws: unknown, raw: string): void;
    close(ws: unknown, code: number, reason: string): void;
  };
  const ws = {
    send(raw: string) {
      const frame = JSON.parse(raw) as Frame;
      if (frame.kind !== "ping") frames.push(frame);
    },
  };
  handler.open(ws);
  return {
    frames,
    async subscribe(key: string, params: ResourceParams): Promise<void> {
      handler.message(ws, JSON.stringify({ op: "sub", key, params }));
      await until(
        () => frames.some((f) => f.kind === "sub-ack" && f.key === key),
        `sub-ack ${key}`,
      );
    },
    deltas: (key: string) =>
      frames.filter((f) => f.kind === "delta" && f.key === key),
    close: () => handler.close(ws, 1000, "test"),
  };
}

/** Wait (bounded) for a condition the async loaders will make true. */
async function until(cond: () => boolean, what: string): Promise<void> {
  const deadline = Date.now() + 5000;
  while (!cond()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 5));
  }
}

// A few macrotasks: every flush and re-drain a change could still schedule.
const settle = async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
};

describe("routeChange — one change, both routers, each entry reached once", () => {
  const TABLE = "rc_unit_items";
  const ROUTED = "test.route-change.unit.routed";
  const LEGACY = "test.route-change.unit.legacy";
  const store = new Map<string, number>([["a", 1]]);
  const loads: Load[] = [];
  const read = (ids: readonly string[]): Row[] =>
    ids.flatMap((id) => (store.has(id) ? [{ id, n: store.get(id)! }] : []));
  const socket = attach();

  beforeAll(async () => {
    pointResource(ROUTED, TABLE, "routed", read, loads);
    pointResource(LEGACY, TABLE, "legacy", read, loads);
    // The captured read-sets, as a real loader run records them at the DB pool
    // chokepoint. The routed key's must NOT make the legacy inversion reach it.
    recordLoaderReadSet(ROUTED, new Set([TABLE]));
    recordLoaderReadSet(LEGACY, new Set([TABLE]));
    await socket.subscribe(ROUTED, { ids: "a" });
    await socket.subscribe(LEGACY, { ids: "a" });
  });

  afterAll(() => socket.close());

  test("an UPDATE refills each subscribed entry exactly once, scoped, and acks its transaction", async () => {
    const at = loads.length;
    store.set("a", 2);
    routeChange({
      source: "feed",
      table: TABLE,
      op: "U",
      ids: ["a"],
      xid: "7001",
      keys: null,
      unchanged: null,
    });
    await until(
      () =>
        socket.deltas(ROUTED).length > 0 && socket.deltas(LEGACY).length > 0,
      "both deltas",
    );
    await settle();
    expect(loads.slice(at)).toEqual([
      { key: ROUTED, ids: ["a"] },
      { key: LEGACY, ids: ["a"] },
    ]);
    for (const key of [ROUTED, LEGACY]) {
      expect(socket.deltas(key).map((d) => [d.upserts, d.ackTx])).toEqual([
        [[["a", { id: "a", n: 2 }]], ["7001"]],
      ]);
    }
  });

  test("a change to a table neither reads reaches neither", async () => {
    const at = loads.length;
    const frames = socket.frames.length;
    routeChange({
      source: "feed",
      table: "rc_unit_elsewhere",
      op: "U",
      ids: ["a"],
      keys: null,
      unchanged: null,
    });
    await settle();
    expect(loads.slice(at)).toEqual([]);
    expect(socket.frames.slice(frames)).toEqual([]);
  });
});

describe("the feed end to end — trigger → listener → routeChange → delta", () => {
  const TABLE = "rc_feed_items";
  const ROUTED = "test.route-change.feed.routed";
  const LEGACY = "test.route-change.feed.legacy";
  let testDb: TestDb;
  let listener: ReturnType<typeof createChangeFeedListener>;
  const loads: Load[] = [];
  let socket: ReturnType<typeof attach>;

  // The listener's LISTEN backend sits idle on `LISTEN live_state` once it is
  // ready (the readiness signal `listener.test.ts` uses too): a statement
  // committed before that would notify no one.
  const waitForListen = async (): Promise<void> => {
    const deadline = Date.now() + 5000;
    for (;;) {
      const res = await testDb.db.execute(
        sql`SELECT 1 FROM pg_stat_activity
            WHERE datname = current_database()
              AND query LIKE 'LISTEN live_state%'
              AND pid <> pg_backend_pid()`,
      );
      if (res.rows.length > 0) return;
      if (Date.now() > deadline)
        throw new Error("timed out waiting for LISTEN");
      await new Promise((r) => setTimeout(r, 20));
    }
  };

  const read = async (ids: readonly string[]): Promise<Row[]> => {
    if (ids.length === 0) return [];
    const res = await testDb.db.execute<Row>(
      sql`SELECT id, n FROM rc_feed_items WHERE id IN (${sql.join(
        ids.map((id) => sql`${id}`),
        sql`, `,
      )}) ORDER BY id`,
    );
    return res.rows.map((r) => RowSchema.parse(r));
  };

  beforeAll(async () => {
    testDb = await createTestDb({ prefix: "cf_route_test" });
    await testDb.db.execute(
      sql`CREATE TABLE rc_feed_items (id text PRIMARY KEY, n integer NOT NULL)`,
    );
    await testDb.db.execute(sql`INSERT INTO rc_feed_items VALUES ('a', 1)`);
    // No rollups and no opt-outs on a throwaway database.
    await rebuildTriggers(
      testDb.db,
      { feedExempt: new Set(), optedOut: new Set(), produced: new Set() },
      [],
    );
    listener = createChangeFeedListener({
      connectionString: () => testDb.connectionString,
      route: routeChange,
      coveredTables: () => [TABLE],
      // No liveness watchdog during the suite: reconnects are not under test.
      livenessIntervalMs: 60_000,
    });
    listener.start();
    await waitForListen();
  });

  afterAll(async () => {
    socket?.close();
    await listener?.stop();
    await testDb?.drop();
  });

  test("an UPDATE statement reaches the routed and the legacy entry once each, as a scoped delta", async () => {
    pointResource(ROUTED, TABLE, "routed", read, loads);
    pointResource(LEGACY, TABLE, "legacy", read, loads);
    recordLoaderReadSet(ROUTED, new Set([TABLE]));
    recordLoaderReadSet(LEGACY, new Set([TABLE]));
    socket = attach();
    await socket.subscribe(ROUTED, { ids: "a" });
    await socket.subscribe(LEGACY, { ids: "a" });

    const at = loads.length;
    await testDb.db.execute(sql`UPDATE rc_feed_items SET n = 2 WHERE id = 'a'`);
    await until(
      () =>
        socket.deltas(ROUTED).length > 0 && socket.deltas(LEGACY).length > 0,
      "both deltas",
    );
    await settle();
    expect(loads.slice(at)).toEqual([
      { key: ROUTED, ids: ["a"] },
      { key: LEGACY, ids: ["a"] },
    ]);
    for (const key of [ROUTED, LEGACY]) {
      const deltas = socket.deltas(key);
      expect(deltas.map((d) => d.upserts)).toEqual([
        [["a", { id: "a", n: 2 }]],
      ]);
      // The statement's transaction id rides the trigger to the ack.
      expect(deltas[0]!.ackTx).toHaveLength(1);
    }
  }, 20_000);
});
