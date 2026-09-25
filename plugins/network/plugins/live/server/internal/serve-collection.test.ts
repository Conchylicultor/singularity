/**
 * `compileCollection` end-to-end: a `liveCollection`'s window and `:rows`
 * specs compiled by `compileWindowQuery`, wired into a real
 * `createResourceRuntime`, reading a real Postgres table (a throwaway database)
 * and driven through the change feed (`applyDbChange`). The membership
 * semantics themselves are pinned by `resource-runtime`'s
 * `runtime-window-membership` suite; THIS suite pins that the decoded
 * where / order / limit reach the SQL each subscription tuple runs.
 *
 * Run: `./singularity test plugins/network/plugins/live`
 * (requires the running embedded cluster — `./singularity build` first).
 */

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { boolean, integer, pgTable, text } from "drizzle-orm/pg-core";
import { Client } from "pg";
import { z } from "zod";
import {
  createTestDb,
  type TestDb,
} from "@plugins/database/plugins/db-test-fixture/server/testing";
import {
  createResourceRuntime,
  type ResourceParams,
} from "@plugins/framework/plugins/resource-runtime/core";
import {
  compileWindowQuery,
  type QueryDb,
} from "@plugins/infra/plugins/query-resource/server";
import { liveCollection } from "@plugins/network/plugins/live/core";
import { compileCollection } from "./serve-collection";

const TABLE = "live_src";

const srcT = pgTable(TABLE, {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  n: integer("n").notNull(),
  enabled: boolean("enabled").notNull(),
});

const SrcSchema = z.object({
  id: z.string(),
  name: z.string(),
  n: z.number(),
  enabled: z.boolean(),
});
type Src = z.infer<typeof SrcSchema>;

let seq = 0;
function collection() {
  return liveCollection(`test.live.src-${seq++}`, {
    row: SrcSchema,
    id: "id",
    filterable: { enabled: z.boolean() },
    sortable: ["n", "name"],
    default: { orderBy: [["n", "asc"]], limit: 2 },
    maxLimit: 50,
  });
}

let t: TestDb;
let client: Client;
let db: NodePgDatabase;

beforeAll(async () => {
  t = await createTestDb({ prefix: "live_serve_test" });
  client = new Client({ connectionString: t.connectionString });
  await client.connect();
  db = drizzle(client);
  await db.execute(
    sql.raw(
      `CREATE TABLE ${TABLE} (id text PRIMARY KEY, name text NOT NULL, n integer NOT NULL, enabled boolean NOT NULL)`,
    ),
  );
});

afterAll(async () => {
  await client.end();
  await t.drop();
});

beforeEach(async () => {
  await db.execute(sql.raw(`DELETE FROM ${TABLE}`));
});

async function put(...rows: Src[]): Promise<void> {
  for (const r of rows) {
    await db.execute(
      sql`INSERT INTO ${srcT} (id, name, n, enabled) VALUES (${r.id}, ${r.name}, ${r.n}, ${r.enabled})
          ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, n = EXCLUDED.n, enabled = EXCLUDED.enabled`,
    );
  }
}

const row = (id: string, n: number, enabled = true, name = id): Src => ({
  id,
  name,
  n,
  enabled,
});

interface SentFrame {
  key: string;
  params?: ResourceParams;
  kind: string;
  value?: unknown;
  upserts?: [string, unknown][];
  deletes?: string[];
  order?: string[];
}

const sameParams = (a: ResourceParams | undefined, b: ResourceParams) =>
  JSON.stringify(a ?? {}) === JSON.stringify(b);

/** Wait (bounded) for a condition the async real-DB loaders will make true. */
async function until(cond: () => boolean, what: string): Promise<void> {
  const deadline = Date.now() + 5000;
  while (!cond()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 5));
  }
}

/** One runtime serving both halves of `c`, over the real table. */
function serve(c: ReturnType<typeof collection>) {
  const specs = compileCollection(c, {
    from: srcT,
    db: db as unknown as QueryDb,
  });
  const runtime = createResourceRuntime({ readSet: () => [TABLE] });
  runtime.defineResource(
    c.window,
    compileWindowQuery(c.window, specs.window).serverOpts,
  );
  runtime.defineResource(
    c.rows,
    compileWindowQuery(c.rows, specs.rows).serverOpts,
  );

  const frames: SentFrame[] = [];
  const handler = runtime.notificationsWsHandler as any;
  const ws = {
    send(raw: string) {
      const msg = JSON.parse(raw) as SentFrame;
      if (msg.kind !== "ping") frames.push(msg);
    },
  };
  handler.open(ws);

  const ackOf = (key: string, params: ResourceParams) =>
    frames.find(
      (f) =>
        f.kind === "sub-ack" && f.key === key && sameParams(f.params, params),
    );
  return {
    frames,
    async subscribe(key: string, params: ResourceParams): Promise<unknown> {
      handler.message(ws, JSON.stringify({ op: "sub", key, params }));
      await until(() => ackOf(key, params) !== undefined, `sub-ack ${key}`);
      return ackOf(key, params)!.value;
    },
    deltas(key: string, params: ResourceParams) {
      return frames.filter(
        (f) =>
          f.kind === "delta" && f.key === key && sameParams(f.params, params),
      );
    },
    change(op: "I" | "U" | "D", ids: string[]) {
      runtime.applyDbChange({
        table: TABLE,
        op,
        ids,
        origin: TABLE,
        identityBase: TABLE,
      });
    },
  };
}

const ids = (value: unknown) => (value as Src[]).map((r) => r.id);

describe("serveCollection — compiled window + point, real Postgres", () => {
  test("a where:{enabled:true} tuple drops a row that flips and backfills the tail", async () => {
    const c = collection();
    const h = serve(c);
    await put(row("a", 1), row("b", 2), row("off", 3, false), row("c", 4));
    const enabled = c.window.window.encode({ where: { enabled: true } });
    expect(enabled).toEqual({ limit: "2", where: '{"enabled":true}' });
    expect(ids(await h.subscribe(c.key, enabled))).toEqual(["a", "b"]);

    await put(row("b", 2, false));
    h.change("U", ["b"]);
    await until(() => h.deltas(c.key, enabled).length > 0, "flip delta");

    const [d] = h.deltas(c.key, enabled);
    expect(d!.deletes).toEqual(["b"]);
    // `off` sorts before `c` but fails the filter: the backfill is `c`.
    expect(d!.upserts).toEqual([["c", row("c", 4)]]);
    expect(d!.order).toEqual(["a", "c"]);
  });

  test("an entrant enters only the tuples whose filter it matches", async () => {
    const c = collection();
    const h = serve(c);
    await put(row("a", 1), row("z", 9, false));
    const on = c.window.window.encode({ where: { enabled: true } });
    const off = c.window.window.encode({ where: { enabled: false } });
    expect(ids(await h.subscribe(c.key, on))).toEqual(["a"]);
    expect(ids(await h.subscribe(c.key, off))).toEqual(["z"]);

    await put(row("new", 0, false));
    h.change("I", ["new"]);
    await until(() => h.deltas(c.key, off).length > 0, "entrant delta");
    await new Promise((r) => setTimeout(r, 50)); // let any stray frame land

    expect(h.deltas(c.key, off)[0]!.order).toEqual(["new", "z"]);
    expect(h.deltas(c.key, on)).toEqual([]);
  });

  test("a name-sorted tuple reorders on a name update", async () => {
    const c = collection();
    const h = serve(c);
    await put(
      row("a", 1, true, "alpha"),
      row("b", 2, true, "bravo"),
      row("c", 3, true, "charlie"),
    );
    const byName = c.window.window.encode({
      orderBy: [["name", "asc"]],
      limit: 3,
    });
    expect(byName).toEqual({ limit: "3", order: '[["name","asc"]]' });
    expect(ids(await h.subscribe(c.key, byName))).toEqual(["a", "b", "c"]);

    await put(row("a", 1, true, "zulu"));
    h.change("U", ["a"]);
    await until(() => h.deltas(c.key, byName).length > 0, "reorder delta");
    const deltas = h.deltas(c.key, byName);
    expect(deltas.at(-1)!.order).toEqual(["b", "c", "a"]);
  });

  test("growing the limit 20 → 40 is a new tuple over the same order", async () => {
    const c = collection();
    const h = serve(c);
    await put(
      ...Array.from({ length: 45 }, (_, i) =>
        row(`r${String(i).padStart(2, "0")}`, i),
      ),
    );
    const p20 = c.window.window.encode({ limit: 20 });
    const p40 = c.window.window.encode({ limit: 40 });
    expect(p20).toEqual({ limit: "20" });
    const v20 = ids(await h.subscribe(c.key, p20));
    const v40 = ids(await h.subscribe(c.key, p40));
    expect(v20).toHaveLength(20);
    expect(v40).toHaveLength(40);
    expect(v40.slice(0, 20)).toEqual(v20);
    expect(() => c.window.window.encode({ limit: 60 })).toThrow(/maxLimit/);
  });

  test("the :rows point sibling reports found rows and omits missing ids, ignoring any filter", async () => {
    const c = collection();
    const h = serve(c);
    await put(row("a", 1), row("off", 2, false));
    const params = c.rows.point.encode(["a", "off", "nope"]);
    expect(ids(await h.subscribe(c.rows.key, params)).sort()).toEqual([
      "a",
      "off",
    ]);
  });
});
