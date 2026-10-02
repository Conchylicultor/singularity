/**
 * The segmented scroll against the REAL feed, on a throwaway database: the
 * change-feed's triggers and LISTEN consumer, `routeChange`, the server-core
 * runtime serving each segment as its own window tuple (`after` / `until`
 * cuts on server-minted `$key`s), and the scroll's own plan
 * (`shared/scroll-plan.ts`) driven by what those tuples' client views
 * hold — exactly as `useLiveScroll` drives it.
 *
 * A random workload of inserts, updates and deletes interleaves with scrolling
 * (`loadMore`). After every statement, once the feed has landed:
 *
 * - every segment's view equals a fresh FULL load of its tuple;
 * - the rows the scroll counts (its gap-free prefix) are a prefix of a fresh
 *   `ORDER BY` read of the whole table — no duplicate, no gap;
 * - no segment already subscribed is reloaded FULL, and every refill names only
 *   rows the statement changed (or a row it made room for).
 *
 * And a head that keeps filling at the segment cap stays a gap-free prefix at
 * every step, and ends collapsed rather than hiding rows.
 *
 * Requires a running Postgres cluster (started by ./singularity build).
 * Run: `./singularity test plugins/network/plugins/live`.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { integer, pgTable, text } from "drizzle-orm/pg-core";
import { Client } from "pg";
import { z } from "zod";
import {
  createTestDb,
  type TestDb,
} from "@plugins/database/plugins/db-test-fixture/server/testing";
import {
  routeChange,
  type FeedChange,
} from "@plugins/database/plugins/change-feed/server";
import {
  createChangeFeedListener,
  rebuildTriggers,
} from "@plugins/database/plugins/change-feed/server/testing";
import {
  defineResource,
  notificationsWsHandler,
  routedTableRequirements,
  type ResourceParams,
} from "@plugins/framework/plugins/server-core/core";
import {
  makeClientView,
  type ClientView,
  type RecordedFrame,
} from "@plugins/framework/plugins/resource-runtime/core/testing";
import type { QueryDb } from "@plugins/infra/plugins/query-resource/server";
import { compileWindowQuery } from "@plugins/infra/plugins/query-resource/server/testing";
import {
  liveCollection,
  LIVE_ROW_KEY,
} from "@plugins/network/plugins/live/core";
import { liveNumber } from "@plugins/network/plugins/live/plugins/filter/core";
import {
  assemble,
  growTail,
  MAX_SCROLL_SEGMENTS,
  reconcile,
  segmentsOf,
  startScroll,
  type ScrollLimits,
  type ScrollState,
  type Segment,
  type SegmentObservation,
} from "../../shared/scroll-plan";
import { compileCollection } from "./serve-collection";

const TABLE = "sco_items";
const items = pgTable(TABLE, {
  id: text("id").primaryKey(),
  n: integer("n").notNull(),
});
const Row = z.object({ id: z.string(), n: z.number() });

const collection = liveCollection("test.live.scroll-oracle.items", {
  row: Row,
  id: "id",
  filterable: { n: liveNumber() },
  sortable: ["n"],
  default: { orderBy: [["n", "asc"]], limit: 2 },
  maxLimit: 6,
  scroll: true,
});
const codec = collection.window.window;
const LIMITS: ScrollLimits = { step: 2, maxLimit: 6 };

interface Load {
  params: string;
  ids: readonly string[] | "FULL";
}

let testDb: TestDb;
let client: Client;
let db: NodePgDatabase;
let listener: ReturnType<typeof createChangeFeedListener>;
const routed: FeedChange[] = [];
const loads: Load[] = [];
const frames: RecordedFrame[] = [];
let frameSeq = 0;
let truth: (params: ResourceParams) => Promise<unknown>;

const handler = notificationsWsHandler as unknown as {
  open(ws: unknown): void;
  message(ws: unknown, raw: string): void;
  close(ws: unknown, code: number, reason: string): void;
};
const ws = {
  send(raw: string) {
    const frame = JSON.parse(raw) as Omit<RecordedFrame, "seq" | "socket">;
    if (frame.kind !== "ping") {
      frames.push({ ...frame, seq: frameSeq++, socket: 0 });
    }
  },
};

async function until(cond: () => boolean, what: () => string): Promise<void> {
  const deadline = Date.now() + 8000;
  while (!cond()) {
    if (Date.now() > deadline) throw new Error(`timed out: ${what()}`);
    await new Promise((r) => setTimeout(r, 5));
  }
}

async function quiet(): Promise<void> {
  const deadline = Date.now() + 8000;
  for (;;) {
    const at = [loads.length, frames.length];
    await new Promise((r) => setTimeout(r, 100));
    if (loads.length === at[0] && frames.length === at[1]) return;
    if (Date.now() > deadline) throw new Error("the runtime never went quiet");
  }
}

beforeAll(async () => {
  testDb = await createTestDb({ prefix: "live_scroll_oracle" });
  client = new Client({ connectionString: testDb.connectionString });
  await client.connect();
  db = drizzle(client);
  await db.execute(
    sql.raw(`CREATE TABLE ${TABLE} (id text PRIMARY KEY, n integer NOT NULL)`),
  );
  const specs = compileCollection(collection, {
    from: items,
    db: db as unknown as QueryDb,
  });
  const opts = compileWindowQuery(collection.window, specs.window).serverOpts;
  defineResource(collection.window, {
    ...opts,
    loader: (p, ctx) => {
      loads.push({
        params: JSON.stringify(p),
        ids: ctx ? [...ctx.affectedIds] : "FULL",
      });
      return opts.loader(p, ctx);
    },
  });
  truth = async (p) => opts.loader(p as never);
  // Installed from the registered routes, as the booted server does.
  await rebuildTriggers(
    testDb.db,
    { feedExempt: new Set(), optedOut: new Set(), produced: new Set() },
    routedTableRequirements(),
  );
  listener = createChangeFeedListener({
    connectionString: () => testDb.connectionString,
    route: (change) => {
      routed.push(change);
      routeChange(change);
    },
    coveredTables: () => [TABLE],
    livenessIntervalMs: 60_000,
  });
  listener.start();
  const deadline = Date.now() + 8000;
  for (;;) {
    const res = await testDb.db.execute(
      sql`SELECT 1 FROM pg_stat_activity
          WHERE datname = current_database()
            AND query LIKE 'LISTEN live_state%'
            AND pid <> pg_backend_pid()`,
    );
    if (res.rows.length > 0) break;
    if (Date.now() > deadline) throw new Error("timed out waiting for LISTEN");
    await new Promise((r) => setTimeout(r, 20));
  }
  handler.open(ws);
}, 30_000);

afterAll(async () => {
  handler.close(ws, 1000, "test");
  await listener?.stop();
  await client?.end();
  await testDb?.drop();
});

/** One segment's window tuple. */
const paramsOf = (seg: Segment): ResourceParams =>
  codec.encode(
    { limit: seg.limit },
    {
      ...(seg.after !== null ? { after: seg.after } : {}),
      ...(seg.until !== null ? { until: seg.until } : {}),
    },
  );

/**
 * The scroll as `useLiveScroll` runs it: the plan, one subscribed window tuple
 * per segment it needs (subscribed by diff), and a client view per tuple.
 */
class Scroll {
  state: ScrollState = startScroll(LIMITS);
  collapses = 0;
  private views = new Map<
    string,
    { params: ResourceParams; view: ClientView; from: number }
  >();

  /** The tuples subscribed before the current statement. */
  subscribedParams(): string[] {
    return [...this.views.keys()];
  }

  private viewOf(params: ResourceParams): ClientView | undefined {
    const entry = this.views.get(JSON.stringify(params));
    if (!entry) return undefined;
    entry.view.applyAll(
      frames
        .slice(entry.from)
        .filter(
          (f) =>
            f.key === collection.key &&
            JSON.stringify(f.params ?? {}) === JSON.stringify(params),
        ),
    );
    entry.from = frames.length;
    return entry.view;
  }

  rowsOf(seg: Segment): { id: string; n: number; $key: string | null }[] {
    return (this.viewOf(paramsOf(seg))?.value ?? []) as {
      id: string;
      n: number;
      $key: string | null;
    }[];
  }

  observe = (seg: Segment): SegmentObservation => {
    const view = this.viewOf(paramsOf(seg));
    if (view === undefined || view.value === undefined) {
      return { kind: "pending" };
    }
    return {
      kind: "settled",
      error: null,
      entries: (view.value as { id: string; $key: string | null }[]).map(
        (r) => ({ id: r.id, key: r[LIVE_ROW_KEY as "$key"] }),
      ),
    };
  };

  /** Subscribe every tuple the plan reads, release the rest. */
  async sync(): Promise<void> {
    const want = new Map(
      segmentsOf(this.state).map((s) => [
        JSON.stringify(paramsOf(s)),
        paramsOf(s),
      ]),
    );
    for (const [k, params] of want) {
      if (this.views.has(k)) continue;
      const from = frames.length;
      this.views.set(k, { params, view: makeClientView(), from });
      handler.message(
        ws,
        JSON.stringify({ op: "sub", key: collection.key, params }),
      );
      await until(
        () =>
          frames
            .slice(from)
            .some(
              (f) =>
                f.kind === "sub-ack" &&
                f.key === collection.key &&
                JSON.stringify(f.params ?? {}) === k,
            ),
        () => `sub-ack ${k}`,
      );
    }
    for (const [k, { params }] of this.views) {
      if (want.has(k)) continue;
      handler.message(
        ws,
        JSON.stringify({ op: "unsub", key: collection.key, params }),
      );
      this.views.delete(k);
    }
  }

  /** Run the plan to a fixpoint, subscribing what each step asks for. */
  async settle(): Promise<void> {
    for (let i = 0; i < 100; i++) {
      await this.sync();
      const out = reconcile(this.state, this.observe, LIMITS);
      if (out.collapsed) this.collapses++;
      if (out.state === this.state) return;
      this.state = out.state;
    }
    throw new Error("the scroll never settled");
  }

  async loadMore(): Promise<boolean> {
    const next = growTail(this.state, this.observe, LIMITS);
    if (next === this.state) return false;
    this.state = next;
    await this.settle();
    return true;
  }

  /** The rows the scroll counts: up to and including the first full bounded segment. */
  prefixIds(): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const seg of this.state.committed) {
      const rows = this.rowsOf(seg);
      for (const r of rows) {
        if (!seen.has(r.id)) {
          seen.add(r.id);
          out.push(r.id);
        }
      }
      if (seg.until !== null && rows.length === seg.limit) break;
    }
    return out;
  }

  /** Every segment view equals a fresh FULL load of its tuple. */
  async converged(): Promise<boolean> {
    for (const seg of this.state.committed) {
      const fresh = await truth(paramsOf(seg));
      if (JSON.stringify(this.rowsOf(seg)) !== JSON.stringify(fresh)) {
        return false;
      }
    }
    return true;
  }
}

async function orderedIds(limit: number): Promise<string[]> {
  const res = await client.query<{ id: string }>(
    `SELECT id FROM ${TABLE} ORDER BY n ASC NULLS LAST, id ASC LIMIT ${limit}`,
  );
  return res.rows.map((r) => r.id);
}

/** Wait until every segment's view equals a fresh load of its tuple, and the runtime is quiet. */
async function converge(scroll: Scroll, what: string): Promise<void> {
  const deadline = Date.now() + 8000;
  while (!(await scroll.converged())) {
    if (Date.now() > deadline)
      throw new Error(`${what}: views never converged`);
    await new Promise((r) => setTimeout(r, 20));
  }
  await quiet();
}

/** Wait for the feed to route this statement's change, then for every view to converge. */
async function landed(scroll: Scroll, routedAt: number, what: string) {
  await until(
    () => routed.slice(routedAt).some((c) => c.table === TABLE),
    () => `${what}: its change was never routed`,
  );
  await converge(scroll, what);
}

function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("segmented scroll over the real feed — differential oracle", () => {
  test("random writes and scrolling: every segment converges, the prefix is gap-free, refills stay O(changed)", async () => {
    const rand = prng(20260930);
    await client.query(`DELETE FROM ${TABLE}`);
    let next = 0;
    const present = new Set<string>();
    const values = Array.from({ length: 30 }, () => {
      const id = `r${next++}`;
      present.add(id);
      return `('${id}', ${Math.floor(rand() * 40)})`;
    });
    let routedAt = routed.length;
    await client.query(
      `INSERT INTO ${TABLE} (id, n) VALUES ${values.join(", ")}`,
    );
    const scroll = new Scroll();
    await until(
      () => routed.slice(routedAt).some((c) => c.table === TABLE),
      () => "seed",
    );
    await scroll.settle();
    for (let i = 0; i < 8; i++) await scroll.loadMore();
    expect(scroll.state.committed.length).toBeGreaterThan(1);

    for (let step = 0; step < 40; step++) {
      if (rand() < 0.2) await scroll.loadMore();
      const before = new Set(scroll.subscribedParams());
      const any = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)]!;
      const roll = rand();
      let what: string;
      let hosts: string[];
      if (roll < 0.4 || present.size < 5) {
        const id = `r${next++}`;
        const n = Math.floor(rand() * 40);
        what = `insert ${id} n=${n}`;
        hosts = [id];
        present.add(id);
        routedAt = routed.length;
        await client.query(`INSERT INTO ${TABLE} (id, n) VALUES ($1, $2)`, [
          id,
          n,
        ]);
      } else if (roll < 0.8) {
        const id = any([...present]);
        const n = Math.floor(rand() * 40);
        what = `update ${id} n=${n}`;
        hosts = [id];
        routedAt = routed.length;
        await client.query(`UPDATE ${TABLE} SET n = $2 WHERE id = $1`, [id, n]);
      } else {
        const id = any([...present]);
        what = `delete ${id}`;
        hosts = [id];
        present.delete(id);
        routedAt = routed.length;
        await client.query(`DELETE FROM ${TABLE} WHERE id = $1`, [id]);
      }
      const loadsAt = loads.length;
      await landed(scroll, routedAt, `step ${step} (${what})`);
      const stepLoads = loads.slice(loadsAt);
      await scroll.settle();
      await converge(scroll, `step ${step} settle`);

      // The counted rows are a prefix of the table's order — no dup, no gap.
      const prefix = scroll.prefixIds();
      expect(new Set(prefix).size).toBe(prefix.length);
      expect({ step, what, prefix }).toEqual({
        step,
        what,
        prefix: await orderedIds(prefix.length),
      });
      // No segment already subscribed reloads FULL; refills name changed rows
      // (or a row a window admitted after an exit).
      for (const load of stepLoads) {
        if (load.ids === "FULL") {
          expect({
            step,
            what,
            fullReloadOf: load.params,
            subscribed: before.has(load.params),
          }).toEqual({
            step,
            what,
            fullReloadOf: load.params,
            subscribed: false,
          });
          continue;
        }
        expect(load.ids.length).toBeLessThanOrEqual(Math.max(1, hosts.length));
      }
      expect(scroll.state.committed.length).toBeLessThanOrEqual(
        MAX_SCROLL_SEGMENTS,
      );
    }
  }, 180_000);

  test("a head that keeps filling at the cap stays a gap-free prefix at every step, and ends collapsed rather than hiding rows", async () => {
    await client.query(`DELETE FROM ${TABLE}`);
    const values = Array.from(
      { length: 90 },
      (_, i) => `('h${i}', ${1000 + i * 2})`,
    );
    let routedAt = routed.length;
    await client.query(
      `INSERT INTO ${TABLE} (id, n) VALUES ${values.join(", ")}`,
    );
    const scroll = new Scroll();
    await until(
      () => routed.slice(routedAt).some((c) => c.table === TABLE),
      () => "seed",
    );
    await scroll.settle();
    // Scroll to the cap.
    for (let i = 0; i < 80 && (await scroll.loadMore()); i++);
    expect(scroll.state.committed.length).toBe(MAX_SCROLL_SEGMENTS);

    // Every insert lands at the order's start: in the head.
    let n = 999;
    for (let i = 0; i < 20 && scroll.collapses === 0; i++, n--) {
      routedAt = routed.length;
      await client.query(`INSERT INTO ${TABLE} (id, n) VALUES ($1, $2)`, [
        `front${i}`,
        n,
      ]);
      await landed(scroll, routedAt, `front insert ${i}`);
      await scroll.settle();
      const prefix = scroll.prefixIds();
      expect(prefix).toEqual(await orderedIds(prefix.length));
      expect(scroll.state.committed.length).toBeLessThanOrEqual(
        MAX_SCROLL_SEGMENTS,
      );
    }
    expect(scroll.collapses).toBeGreaterThan(0);
    // Collapsed onto the head: what it renders is the true prefix, and it can page again.
    const a = assemble(scroll.state, scroll.observe, LIMITS);
    expect(a.entries.map((e) => e.id)).toEqual(
      await orderedIds(a.entries.length),
    );
    expect(a.canGrow).toBe(true);
  }, 180_000);
});
