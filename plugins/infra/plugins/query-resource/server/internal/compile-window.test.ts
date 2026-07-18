/**
 * `compileWindowQuery` / `windowQueryResource` — SQL shapes, params-driven
 * limits, and the module-eval misuse guards for the bounded (window / point)
 * compiler. Fake `db` renders SQL via `PgDialect` (same harness as
 * `compile.test.ts`); no live DB.
 * Run: `bun test plugins/infra/plugins/query-resource/server/internal/compile-window.test.ts`.
 */

import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { eq, type SQL } from "drizzle-orm";
import { PgDialect, QueryBuilder, integer, pgTable, text } from "drizzle-orm/pg-core";
import {
  pointQueryResourceDescriptor,
  windowQueryResourceDescriptor,
} from "@plugins/infra/plugins/query-resource/core";
import { compileWindowQuery, windowQueryResource } from "./compile-window";
import type { QueryDb, SelectMap, WindowQueryResourceSpec } from "./spec";
import type { WindowParams, PointParams } from "@plugins/primitives/plugins/live-state/core";

const rows = pgTable("rows", {
  id: text("id").primaryKey(),
  parentId: text("parent_id"),
  n: integer("n").notNull(),
  dismissed: integer("dismissed").notNull(),
});

const rowSchema = z.object({ id: z.string(), n: z.number() });

// Unique-key descriptor factories (descriptors self-register globally by key).
let seq = 0;
const winDescriptor = (opts: { defaultLimit: number } = { defaultLimit: 100 }) =>
  windowQueryResourceDescriptor(`test.cw.win-${seq++}`, rowSchema, "id", opts);
const ptDescriptor = () =>
  pointQueryResourceDescriptor(`test.cw.pt-${seq++}`, rowSchema, "id");

// ── Fake db: records rendered SQL, returns scripted rows (compile.test.ts twin) ──
interface Recorded {
  sql: string;
  params: unknown[];
}
function fakeDb(script: (info: Recorded) => unknown[] = () => []): {
  db: QueryDb;
  calls: Recorded[];
} {
  const dialect = new PgDialect();
  const calls: Recorded[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wrap = (q: any): any => ({
    where: (p: SQL) => wrap(q.where(p)),
    orderBy: (...o: SQL[]) => wrap(q.orderBy(...o)),
    limit: (nn: number) => wrap(q.limit(nn)),
    then: (
      resolve: (v: unknown[]) => unknown,
      reject?: (e: unknown) => unknown,
    ) => {
      const rec = dialect.sqlToQuery(q.getSQL());
      calls.push({ sql: rec.sql, params: rec.params });
      return Promise.resolve(script({ sql: rec.sql, params: rec.params })).then(
        resolve,
        reject,
      );
    },
  });
  const qb = new QueryBuilder();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const makeFrom = (builder: any) => ({ from: (t: any) => wrap(builder.from(t)) });
  const db = {
    select: (fields?: SelectMap) =>
      makeFrom(fields ? qb.select(fields) : qb.select()),
    selectDistinct: (fields: SelectMap) => makeFrom(qb.selectDistinct(fields)),
  } as unknown as QueryDb;
  return { db, calls };
}

describe("compileWindowQuery — window SQL", () => {
  test("FULL loader: where + declared order + pk tiebreaker (NULLS LAST) + params-decoded limit", async () => {
    const { db, calls } = fakeDb();
    const { serverOpts, keyField, identityTableName } = compileWindowQuery(
      winDescriptor(),
      {
        from: rows,
        select: { id: rows.id, n: rows.n },
        where: eq(rows.dismissed, 0),
        orderBy: { col: rows.n, dir: "desc" },
        window: { maxLimit: 500 },
        db,
      },
    );
    expect(keyField).toBe("id");
    expect(identityTableName).toBe("rows");
    expect(serverOpts).toMatchObject({ identityTable: "rows" });
    await serverOpts.loader({ limit: "100" });
    expect(calls[0]!.sql).toBe(
      `select "id", "n" from "rows" where "rows"."dismissed" = $1 ` +
        `order by "rows"."n" DESC NULLS LAST, "rows"."id" ASC NULLS LAST limit $2`,
    );
    expect(calls[0]!.params).toEqual([0, 100]);
  });

  test("the limit comes from the subscription params and clamps to maxLimit", async () => {
    const { db, calls } = fakeDb();
    const { serverOpts } = compileWindowQuery(winDescriptor({ defaultLimit: 10 }), {
      from: rows,
      select: { id: rows.id, n: rows.n },
      orderBy: { col: rows.n },
      window: { maxLimit: 50 },
      db,
    });
    await serverOpts.loader({ limit: "25" });
    expect(calls[0]!.params).toEqual([25]);
    await serverOpts.loader({ limit: "9999" }); // over the cap → clamped, never trusted
    expect(calls[1]!.params).toEqual([50]);
  });

  test("malformed params throw loudly instead of loading an unbounded window", () => {
    const { db } = fakeDb();
    const { serverOpts } = compileWindowQuery(winDescriptor(), {
      from: rows,
      select: { id: rows.id, n: rows.n },
      orderBy: { col: rows.n },
      window: { maxLimit: 500 },
      db,
    });
    expect(() => serverOpts.loader({} as WindowParams)).toThrow(/params\.limit/);
    expect(() => serverOpts.loader({ limit: "1e9" })).toThrow(/params\.limit/);
  });

  test("scoped refill: where ∧ pk IN (...), NO order/limit", async () => {
    const { db, calls } = fakeDb();
    const { serverOpts } = compileWindowQuery(winDescriptor(), {
      from: rows,
      select: { id: rows.id, n: rows.n },
      where: eq(rows.dismissed, 0),
      orderBy: { col: rows.n, dir: "desc" },
      window: { maxLimit: 500 },
      db,
    });
    await serverOpts.loader({ limit: "100" }, { affectedIds: ["a", "b"] });
    expect(calls[0]!.sql).toBe(
      `select "id", "n" from "rows" where ("rows"."dismissed" = $1 and "rows"."id" in ($2, $3))`,
    );
    expect(calls[0]!.params).toEqual([0, "a", "b"]);
  });

  test("windowIdsOf: pk-only projection, SAME where/order/limit as the loader", async () => {
    const { db, calls } = fakeDb(() => [{ id: "a" }, { id: "b" }]);
    const { serverOpts } = compileWindowQuery(winDescriptor(), {
      from: rows,
      select: { id: rows.id, n: rows.n },
      where: eq(rows.dismissed, 0),
      orderBy: { col: rows.n, dir: "desc" },
      window: { maxLimit: 500 },
      db,
    });
    const membership = serverOpts.membership!;
    expect(membership.kind).toBe("window");
    if (membership.kind !== "window") throw new Error("unreachable");
    const ids = await membership.windowIdsOf({ limit: "42" });
    expect(calls[0]!.sql).toBe(
      `select "id" from "rows" where "rows"."dismissed" = $1 ` +
        `order by "rows"."n" DESC NULLS LAST, "rows"."id" ASC NULLS LAST limit $2`,
    );
    expect(calls[0]!.params).toEqual([0, 42]);
    expect(ids).toEqual(["a", "b"]);
  });

  test("orderSignatureOf: derived from the declared order columns; the pk tiebreaker is excluded", () => {
    const { db } = fakeDb();
    const { serverOpts } = compileWindowQuery(winDescriptor(), {
      from: rows,
      select: { id: rows.id, n: rows.n },
      orderBy: { col: rows.n, dir: "desc" },
      window: { maxLimit: 500 },
      db,
    });
    const membership = serverOpts.membership!;
    if (membership.kind !== "window") throw new Error("unreachable");
    const sig = membership.orderSignatureOf!;
    // Same order value, different pk → same signature (the tiebreaker is
    // immutable and excluded); different order value → different signature.
    expect(sig({ id: "a", n: 1 })).toBe(sig({ id: "b", n: 1 }));
    expect(sig({ id: "a", n: 1 })).not.toBe(sig({ id: "a", n: 2 }));
  });

  test("orderSignatureOf: multi-key windows join every declared column, read off projection aliases", () => {
    const { db } = fakeDb();
    const { serverOpts } = compileWindowQuery(winDescriptor(), {
      from: rows,
      select: { id: rows.id, count: rows.n, parent: rows.parentId },
      orderBy: [
        { col: rows.n, dir: "desc" },
        { col: rows.parentId, nullable: true },
      ],
      window: { maxLimit: 500 },
      db,
    });
    const membership = serverOpts.membership!;
    if (membership.kind !== "window") throw new Error("unreachable");
    const sig = membership.orderSignatureOf!;
    // Reads the ALIASED wire fields (`count`, `parent`), not the DB names.
    expect(sig({ id: "a", count: 1, parent: "p" })).toBe(
      sig({ id: "z", count: 1, parent: "p" }),
    );
    expect(sig({ id: "a", count: 1, parent: "p" })).not.toBe(
      sig({ id: "a", count: 1, parent: "q" }),
    );
    // Adjacent values never collide across the field boundary (JSON-quoted).
    expect(sig({ id: "a", count: 1, parent: null })).not.toBe(
      sig({ id: "a", count: 1, parent: "null" }),
    );
  });

  test("an unprojected order column throws at module eval", () => {
    const { db } = fakeDb();
    expect(() =>
      compileWindowQuery(winDescriptor(), {
        from: rows,
        select: { id: rows.id }, // n is the order column but is not projected
        orderBy: { col: rows.n },
        window: { maxLimit: 500 },
        db,
      }),
    ).toThrow(/order column "n" is not projected/);
  });

  test("an orderBy already targeting the pk gets no duplicate tiebreaker", async () => {
    const { db, calls } = fakeDb();
    const { serverOpts } = compileWindowQuery(winDescriptor(), {
      from: rows,
      select: { id: rows.id, n: rows.n },
      orderBy: { col: rows.id, dir: "desc" },
      window: { maxLimit: 500 },
      db,
    });
    await serverOpts.loader({ limit: "10" });
    expect(calls[0]!.sql).toBe(
      `select "id", "n" from "rows" order by "rows"."id" DESC NULLS LAST limit $1`,
    );
  });
});

describe("compileWindowQuery — point", () => {
  test("FULL loader reads the params-decoded id set; membership.idsOf IS the descriptor decode", async () => {
    const { db, calls } = fakeDb();
    const descriptor = ptDescriptor();
    const { serverOpts, keyField } = compileWindowQuery(descriptor, {
      from: rows,
      identity: { pk: rows.parentId },
      select: { conversationId: rows.parentId, n: rows.n },
      point: { by: rows.parentId },
      db,
    });
    expect(keyField).toBe("conversationId");
    await serverOpts.loader({ ids: "c1,c2" });
    expect(calls[0]!.sql).toBe(
      `select "parent_id", "n" from "rows" where "rows"."parent_id" in ($1, $2)`,
    );
    expect(calls[0]!.params).toEqual(["c1", "c2"]);

    const membership = serverOpts.membership!;
    expect(membership.kind).toBe("point");
    if (membership.kind !== "point") throw new Error("unreachable");
    expect(membership.idsOf({ ids: "b,a" })).toEqual(["b", "a"]);
  });

  test("scoped load reads ctx.affectedIds, not the params set", async () => {
    const { db, calls } = fakeDb();
    const { serverOpts } = compileWindowQuery(ptDescriptor(), {
      from: rows,
      point: { by: rows.id },
      db,
    });
    await serverOpts.loader({ ids: "a,b,c" }, { affectedIds: ["b"] });
    expect(calls[0]!.params).toEqual(["b"]);
  });

  test("an empty id set short-circuits to [] with NO query", async () => {
    const { db, calls } = fakeDb();
    const { serverOpts } = compileWindowQuery(ptDescriptor(), {
      from: rows,
      point: { by: rows.id },
      db,
    });
    expect(await serverOpts.loader({ ids: "" })).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  test("a static where composes with the id set", async () => {
    const { db, calls } = fakeDb();
    const { serverOpts } = compileWindowQuery(ptDescriptor(), {
      from: rows,
      where: eq(rows.dismissed, 0),
      point: { by: rows.id },
      db,
    });
    await serverOpts.loader({ ids: "a" });
    expect(calls[0]!.sql).toBe(
      `select "id", "parent_id", "n", "dismissed" from "rows" ` +
        `where ("rows"."dismissed" = $1 and "rows"."id" in ($2))`,
    );
  });
});

describe("compileWindowQuery — misuse guards (module-eval throws)", () => {
  const { db } = fakeDb();
  const base = { from: rows, select: { id: rows.id, n: rows.n }, db };

  test("window and point are mutually exclusive", () => {
    expect(() =>
      compileWindowQuery(winDescriptor(), {
        ...base,
        orderBy: { col: rows.n },
        window: { maxLimit: 10 },
        point: { by: rows.id },
      } as WindowQueryResourceSpec<WindowParams>),
    ).toThrow(/mutually exclusive/);
  });

  test("neither window nor point → use queryResource instead", () => {
    expect(() =>
      compileWindowQuery(winDescriptor(), { ...base } as WindowQueryResourceSpec<WindowParams>),
    ).toThrow(/use queryResource/);
  });

  test("window without orderBy", () => {
    expect(() =>
      compileWindowQuery(winDescriptor(), { ...base, window: { maxLimit: 10 } }),
    ).toThrow(/REQUIRES `orderBy`/);
  });

  test("defaultLimit > maxLimit", () => {
    expect(() =>
      compileWindowQuery(winDescriptor({ defaultLimit: 100 }), {
        ...base,
        orderBy: { col: rows.n },
        window: { maxLimit: 50 },
      }),
    ).toThrow(/defaultLimit \(100\) exceeds window\.maxLimit \(50\)/);
  });

  test("non-integer maxLimit", () => {
    expect(() =>
      compileWindowQuery(winDescriptor({ defaultLimit: 1 }), {
        ...base,
        orderBy: { col: rows.n },
        window: { maxLimit: 2.5 },
      }),
    ).toThrow(/maxLimit must be a positive integer/);
  });

  test("point with orderBy (point sets are unordered)", () => {
    expect(() =>
      compileWindowQuery(ptDescriptor(), {
        ...base,
        orderBy: { col: rows.n },
        point: { by: rows.id },
      } as WindowQueryResourceSpec<PointParams>),
    ).toThrow(/point sets are unordered/);
  });

  test("point.by must BE the identity pk when both are declared", () => {
    expect(() =>
      compileWindowQuery(ptDescriptor(), {
        ...base,
        identity: { pk: rows.id },
        point: { by: rows.parentId },
      }),
    ).toThrow(/`point\.by` must BE the identity pk/);
  });

  test("descriptor/spec kind drift: a point descriptor with a window spec", () => {
    expect(() =>
      compileWindowQuery(ptDescriptor(), {
        ...base,
        orderBy: { col: rows.n },
        window: { maxLimit: 10 },
      } as WindowQueryResourceSpec<PointParams>),
    ).toThrow(/no window codec/);
  });

  test("descriptor/spec kind drift: a window descriptor with a point spec", () => {
    expect(() =>
      compileWindowQuery(winDescriptor(), {
        ...base,
        point: { by: rows.id },
      } as WindowQueryResourceSpec<WindowParams>),
    ).toThrow(/no point codec/);
  });
});

describe("windowQueryResource — descriptor/keyField assertion", () => {
  test("throws loudly when queryPk disagrees with the derived keyField", () => {
    const { db } = fakeDb();
    // keyField derives to "id"; the descriptor keys on "n" → throw BEFORE any
    // real defineResource registration (mirrors the queryResource guard).
    const descriptor = windowQueryResourceDescriptor(
      "test.cw.mismatch",
      rowSchema,
      "n",
      { defaultLimit: 10 },
    );
    expect(() =>
      windowQueryResource(descriptor, {
        from: rows,
        select: { id: rows.id, n: rows.n },
        orderBy: { col: rows.n },
        window: { maxLimit: 100 },
        db,
      }),
    ).toThrow(/does not match the keyField "id"/);
  });
});
