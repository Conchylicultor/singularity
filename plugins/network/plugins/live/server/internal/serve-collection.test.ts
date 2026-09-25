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
import { eq, sql, type SQL } from "drizzle-orm";
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
import {
  and,
  liveBoolean,
  liveText,
  or,
} from "@plugins/network/plugins/live/plugins/filter/core";
import { compileCollection } from "./serve-collection";

const TABLE = "live_src";

// `hidden` and `secret` are server-only: no row field names them, so the
// derived projection must never put them on the wire. `hidden` is also the
// base-membership column of the `where` tests.
const srcT = pgTable(TABLE, {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  n: integer("n").notNull(),
  enabled: boolean("enabled").notNull(),
  kind: text("kind"),
  hidden: boolean("hidden").notNull(),
  secret: text("secret"),
});

const SrcSchema = z.object({
  id: z.string(),
  name: z.string(),
  n: z.number(),
  enabled: z.boolean(),
  kind: z.string().nullable(),
});
type Src = z.infer<typeof SrcSchema>;

let seq = 0;
function collection() {
  return liveCollection(`test.live.src-${seq++}`, {
    row: SrcSchema,
    id: "id",
    filterable: { enabled: liveBoolean(), kind: liveText() },
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
      `CREATE TABLE ${TABLE} (id text PRIMARY KEY, name text NOT NULL, n integer NOT NULL, ` +
        `enabled boolean NOT NULL, kind text, hidden boolean NOT NULL DEFAULT false, ` +
        `secret text NOT NULL DEFAULT 'server-only')`,
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
      sql`INSERT INTO ${srcT} (id, name, n, enabled, kind) VALUES (${r.id}, ${r.name}, ${r.n}, ${r.enabled}, ${r.kind})
          ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, n = EXCLUDED.n, enabled = EXCLUDED.enabled, kind = EXCLUDED.kind`,
    );
  }
}

const row = (
  id: string,
  n: number,
  enabled = true,
  name = id,
  kind: string | null = null,
): Src => ({
  id,
  name,
  n,
  enabled,
  kind,
});

const hide = async (id: string, hidden = true): Promise<void> => {
  await db.execute(sql`UPDATE ${srcT} SET hidden = ${hidden} WHERE id = ${id}`);
};

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

/** One runtime serving all three resources of `c`, over the real table. */
function serve(c: ReturnType<typeof collection>, opts: { where?: SQL } = {}) {
  const specs = compileCollection(c, {
    from: srcT,
    db: db as unknown as QueryDb,
    ...opts,
  });
  // Every key reads the one table — the read-set a real server captures
  // automatically at the DB pool chokepoint on the first load.
  const runtime = createResourceRuntime({ readSet: () => [TABLE] });
  runtime.defineResource(
    c.window,
    compileWindowQuery(c.window, specs.window).serverOpts,
  );
  runtime.defineResource(
    c.rows,
    compileWindowQuery(c.rows, specs.rows).serverOpts,
  );
  runtime.defineResource(c.groups, specs.groups);

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
    /** Whole-value pushes (a plain push resource's frames). */
    updates(key: string, params: ResourceParams) {
      return frames.filter(
        (f) =>
          f.kind === "update" && f.key === key && sameParams(f.params, params),
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
    expect(enabled).toEqual({
      limit: "2",
      where: '{"column":"enabled","op":"eq","operand":true}',
    });
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

  test("an or tree window reads exactly the rows either branch matches", async () => {
    const c = collection();
    const h = serve(c);
    await put(
      row("a", 1, true, "a", "build"),
      row("b", 2, false, "b", "alert"),
      row("c", 3, false, "c", null),
      row("d", 4, true, "d", "alert"),
      row("e", 5, false, "e", "build"),
    );
    const params = c.window.window.encode({
      where: or(
        { column: "kind", op: "eq", operand: "build" },
        and(
          { column: "enabled", op: "eq", operand: false },
          { column: "kind", op: "isEmpty" },
        ),
      ),
      limit: 10,
    });
    expect(ids(await h.subscribe(c.key, params))).toEqual(["a", "c", "e"]);
  });

  test("ne is the complement of eq: it keeps NULL rows", async () => {
    const c = collection();
    const h = serve(c);
    await put(
      row("a", 1, true, "a", "build"),
      row("b", 2, true, "b", "alert"),
      row("c", 3, true, "c", null),
    );
    const ne = c.window.window.encode({
      where: { kind: { ne: "build" } },
      limit: 10,
    });
    const eq = c.window.window.encode({ where: { kind: "build" }, limit: 10 });
    expect(ids(await h.subscribe(c.key, ne))).toEqual(["b", "c"]);
    expect(ids(await h.subscribe(c.key, eq))).toEqual(["a"]);
  });

  test("a non-canonical where is refused, never served", () => {
    const c = collection();
    const specs = compileCollection(c, {
      from: srcT,
      db: db as unknown as QueryDb,
    });
    const where = specs.window.where as (p: Record<string, string>) => unknown;
    expect(() =>
      where({
        limit: "2",
        where: '{"and":[{"column":"enabled","op":"eq","operand":true}]}',
      }),
    ).toThrow(/not canonical/);
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

describe("serveCollection — derived projection", () => {
  test("selects exactly the row schema's fields — a server-only column never reaches the wire", async () => {
    const c = collection();
    const specs = compileCollection(c, {
      from: srcT,
      db: db as unknown as QueryDb,
    });
    expect(Object.keys(specs.select)).toEqual([...c.rowKeys]);
    expect(Object.keys(specs.select)).not.toContain("secret");

    const h = serve(c);
    await put(row("a", 1, true, "a", "x"));
    const [first] = (await h.subscribe(c.key, { limit: "2" })) as Record<
      string,
      unknown
    >[];
    expect(first).toEqual(row("a", 1, true, "a", "x"));
    expect(Object.keys(first!).sort()).toEqual([...c.rowKeys].sort());
    const [pointRow] = (await h.subscribe(c.rows.key, { ids: "a" })) as Record<
      string,
      unknown
    >[];
    expect(pointRow).toEqual(row("a", 1, true, "a", "x"));
  });

  test("a row field bound to no column throws at compile time", () => {
    const Wide = SrcSchema.extend({ bogus: z.string() });
    const c = liveCollection(`test.live.wide-${seq++}`, {
      row: Wide,
      id: "id",
      filterable: {},
      sortable: ["n"],
      default: { orderBy: [["n", "asc"]], limit: 1 },
      maxLimit: 1,
    });
    expect(() =>
      // @ts-expect-error — `bogus` is not a column of srcT, so `columns` is required
      compileCollection(c, { from: srcT, db: db as unknown as QueryDb }),
    ).toThrow(/row field "bogus" binds to no column/);
  });
});

describe("serveCollection — :groups", () => {
  async function seed(): Promise<void> {
    await put(
      row("a", 1, true, "a", "build"),
      row("b", 2, true, "b", "build"),
      row("c", 3, false, "c", "build"),
      row("d", 4, true, "d", "alert"),
      row("e", 5, true, "e", "alert"),
      row("f", 6, true, "f", null),
      row("g", 7, true, "g", "zeta"),
      row("h", 8, false, "h", "Alpha"),
    );
  }

  function loader(c: ReturnType<typeof collection>, where?: SQL) {
    const specs = compileCollection(c, {
      from: srcT,
      db: db as unknown as QueryDb,
      ...(where ? { where } : {}),
    });
    return (q: Parameters<typeof c.groups.groups.encode>[0]) =>
      specs.groups.loader(c.groups.groups.encode(q));
  }

  test("counts per value, ordered count desc then value (code point), NULL its own group", async () => {
    const c = collection();
    await seed();
    expect(await loader(c)({ groupBy: "kind" })).toEqual([
      { value: "build", count: 3 },
      { value: "alert", count: 2 },
      // Equal counts: code-point order ("A" < "z"), NULL last.
      { value: "Alpha", count: 1 },
      { value: "zeta", count: 1 },
      { value: null, count: 1 },
    ]);
    expect(await loader(c)({ groupBy: "enabled" })).toEqual([
      { value: true, count: 6 },
      { value: false, count: 2 },
    ]);
  });

  test("where filters the rows grouped; the grouped column may be left out to keep every value", async () => {
    const c = collection();
    await seed();
    expect(
      await loader(c)({ groupBy: "kind", where: { enabled: true } }),
    ).toEqual([
      { value: "alert", count: 2 },
      { value: "build", count: 2 },
      { value: "zeta", count: 1 },
      { value: null, count: 1 },
    ]);
    expect(
      await loader(c)({
        groupBy: "enabled",
        where: { kind: { isEmpty: true } },
      }),
    ).toEqual([{ value: true, count: 1 }]);
  });

  test("limit pages through groups in the fixed order", async () => {
    const c = collection();
    await seed();
    const two = await loader(c)({ groupBy: "kind", limit: 2 });
    const four = await loader(c)({ groupBy: "kind", limit: 4 });
    expect(two).toEqual([
      { value: "build", count: 3 },
      { value: "alert", count: 2 },
    ]);
    expect(four.slice(0, 2)).toEqual(two);
    expect(four).toHaveLength(4);
  });

  test("the base where applies to every grouping", async () => {
    const c = collection();
    await seed();
    await hide("a");
    await hide("d");
    expect(
      await loader(c, eq(srcT.hidden, false))({ groupBy: "kind" }),
    ).toEqual([
      { value: "build", count: 2 },
      { value: "Alpha", count: 1 },
      { value: "alert", count: 1 },
      { value: "zeta", count: 1 },
      { value: null, count: 1 },
    ]);
  });

  test("a value the row schema's field cannot hold fails loudly", async () => {
    const c = liveCollection(`test.live.enum-${seq++}`, {
      row: SrcSchema.extend({
        kind: z.enum(["build", "alert"]).nullable(),
      }),
      id: "id",
      filterable: { kind: liveText() },
      sortable: ["n"],
      default: { orderBy: [["n", "asc"]], limit: 1 },
      maxLimit: 1,
    });
    await seed();
    const specs = compileCollection(c, {
      from: srcT,
      db: db as unknown as QueryDb,
    });
    // The grouped column holds "zeta" and "Alpha", which the row type cannot.
    const failure = await Promise.resolve(
      specs.groups.loader(c.groups.groups.encode({ groupBy: "kind" })),
    ).then(
      () => null,
      (err: unknown) => err,
    );
    expect(String(failure)).toMatch(/does not parse as the row schema's field/);
  });

  test("a subscribed grouping is re-run and re-pushed on a table change (read-set routing)", async () => {
    const c = collection();
    const h = serve(c);
    await seed();
    const params = c.groups.groups.encode({ groupBy: "kind", limit: 2 });
    expect(await h.subscribe(c.groups.key, params)).toEqual([
      { value: "build", count: 3 },
      { value: "alert", count: 2 },
    ]);
    await put(
      row("i", 9, true, "i", "alert"),
      row("j", 10, true, "j", "alert"),
    );
    h.change("I", ["i", "j"]);
    await until(
      () => h.updates(c.groups.key, params).length > 0,
      "groups update",
    );
    expect(h.updates(c.groups.key, params).at(-1)!.value).toEqual([
      { value: "alert", count: 4 },
      { value: "build", count: 3 },
    ]);
  });
});

describe("serveCollection — base where", () => {
  test("a base-where flip removes the row from the window, the :rows tuple and the group counts", async () => {
    const c = collection();
    const h = serve(c, { where: eq(srcT.hidden, false) });
    await put(
      row("a", 1, true, "a", "build"),
      row("b", 2, true, "b", "build"),
      row("c", 3, true, "c", "alert"),
    );
    await hide("c");
    const windowParams = c.window.window.encode();
    const pointParams = c.rows.point.encode(["a", "b"]);
    const groupParams = c.groups.groups.encode({ groupBy: "kind" });
    expect(ids(await h.subscribe(c.key, windowParams))).toEqual(["a", "b"]);
    expect(ids(await h.subscribe(c.rows.key, pointParams)).sort()).toEqual([
      "a",
      "b",
    ]);
    expect(await h.subscribe(c.groups.key, groupParams)).toEqual([
      { value: "build", count: 2 },
    ]);

    // `c` (hidden) is outside the collection: not even an explicit id finds it.
    expect(
      ids(await h.subscribe(c.rows.key, c.rows.point.encode(["c"]))),
    ).toEqual([]);

    await hide("b");
    h.change("U", ["b"]);
    await until(
      () =>
        h.deltas(c.key, windowParams).length > 0 &&
        h.deltas(c.rows.key, pointParams).length > 0 &&
        h.updates(c.groups.key, groupParams).length > 0,
      "flip frames",
    );

    const w = h.deltas(c.key, windowParams).at(-1)!;
    expect(w.deletes).toEqual(["b"]);
    expect(w.order).toEqual(["a"]);
    const p = h.deltas(c.rows.key, pointParams).at(-1)!;
    expect(p.deletes).toEqual(["b"]);
    expect(p.order).toEqual(["a"]);
    expect(h.updates(c.groups.key, groupParams).at(-1)!.value).toEqual([
      { value: "build", count: 1 },
    ]);

    // Flipping back re-enters it: the point set still names `b`.
    await hide("b", false);
    h.change("U", ["b"]);
    await until(
      () => h.deltas(c.rows.key, pointParams).length > 1,
      "re-entry delta",
    );
    expect(h.deltas(c.rows.key, pointParams).at(-1)!.upserts).toEqual([
      ["b", row("b", 2, true, "b", "build")],
    ]);
  });
});
