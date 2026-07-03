import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { desc, eq, type SQL } from "drizzle-orm";
import {
  PgDialect,
  QueryBuilder,
  integer,
  pgTable,
  pgView,
  primaryKey,
  text,
} from "drizzle-orm/pg-core";
import { queryResourceDescriptor } from "@plugins/infra/plugins/query-resource/core";
import { compileQuery, queryResource } from "./compile";
import { resolveIdentity } from "./identity";
import { rel } from "./rel";
import type { QueryDb, SelectMap } from "./spec";

// ── Throwaway physical schema (no live DB) ─────────────────────────────────
const rows = pgTable("rows", {
  id: text("id").primaryKey(),
  parentId: text("parent_id"),
  n: integer("n").notNull(),
});
const junction = pgTable(
  "junction",
  { a: text("a").notNull(), b: text("b").notNull() },
  (t) => [primaryKey({ columns: [t.a, t.b] })],
);
const noPk = pgTable("no_pk", { x: text("x").notNull() });
const rowsView = pgView("rows_v").as((qb) => qb.select().from(rows));

// A structural entity (the `infra/entities` Entity shape the compiler detects).
const entity = {
  name: "widgets",
  table: rows,
  wireColumns: { id: rows.id, n: rows.n },
  schema: z.object({ id: z.string(), n: z.number() }),
};

// ── Fake db: records rendered SQL, returns scripted rows ───────────────────
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

describe("resolveIdentity", () => {
  test("PgTable: base name, single pk, keyField = pk prop", () => {
    const r = resolveIdentity(rows, undefined, undefined);
    expect(r.tableName).toBe("rows");
    expect(r.pkColumn).toBe(rows.id);
    expect(r.keyField).toBe("id");
    expect(r.selectMap).toBeUndefined();
  });

  test("Entity: name is the base table, default projection = wireColumns", () => {
    const r = resolveIdentity(entity, undefined, undefined);
    expect(r.tableName).toBe("widgets");
    expect(r.rel).toBe(rows);
    expect(r.pkColumn).toBe(rows.id);
    expect(r.keyField).toBe("id");
    expect(r.selectMap).toBe(entity.wireColumns);
  });

  test("alias projection: keyField is the alias, not the DB column", () => {
    const r = resolveIdentity(
      rows,
      { pk: rows.parentId },
      { conversationId: rows.parentId, n: rows.n },
    );
    expect(r.keyField).toBe("conversationId");
    expect(r.pkColumn).toBe(rows.parentId);
  });

  test("composite PK throws", () => {
    expect(() => resolveIdentity(junction, undefined, undefined)).toThrow(
      /composite primary key/,
    );
  });

  test("PgTable with no primary key throws", () => {
    expect(() => resolveIdentity(noPk, undefined, undefined)).toThrow(
      /no primary-key column/,
    );
  });

  test("PgView without identity.pk throws", () => {
    expect(() => resolveIdentity(rowsView, undefined, undefined)).toThrow(
      /needs identity\.pk/,
    );
  });

  test("PgView with an unresolved identity base throws", () => {
    // `rows_v` is not a declared identity view, so relationIdentityBase leaves it
    // unresolved and no identity.table is supplied → loud throw.
    expect(() =>
      resolveIdentity(rowsView, { pk: rowsView.id }, undefined),
    ).toThrow(/no declared identity base/);
  });

  test("PgView with explicit identity.table resolves", () => {
    const r = resolveIdentity(
      rowsView,
      { table: "rows", pk: rowsView.id },
      { id: rowsView.id },
    );
    expect(r.tableName).toBe("rows");
    expect(r.keyField).toBe("id");
  });

  test("pk column not present in the projection throws", () => {
    expect(() =>
      resolveIdentity(rows, undefined, { n: rows.n }),
    ).toThrow(/not present in the select projection/);
  });
});

describe("compileQuery — SQL", () => {
  test("full query: select + orderBy, identityTable policy", async () => {
    const { db, calls } = fakeDb();
    const { serverOpts, keyField, identityTableName } = compileQuery({
      from: rows,
      select: { id: rows.id, n: rows.n },
      orderBy: desc(rows.n),
      db,
    });
    expect(keyField).toBe("id");
    expect(identityTableName).toBe("rows");
    expect(serverOpts).toMatchObject({ identityTable: "rows" });
    await serverOpts.loader({});
    expect(calls[0]!.sql).toBe(
      `select "id", "n" from "rows" order by "rows"."n" desc`,
    );
  });

  test("scoped refill: where = pk IN (...), no order/limit", async () => {
    const { db, calls } = fakeDb();
    const { serverOpts } = compileQuery({
      from: rows,
      select: { id: rows.id, n: rows.n },
      orderBy: desc(rows.n),
      limit: 50,
      db,
    });
    await serverOpts.loader({}, { affectedIds: ["a", "b"] });
    expect(calls[0]!.sql).toBe(
      `select "id", "n" from "rows" where "rows"."id" in ($1, $2)`,
    );
    expect(calls[0]!.params).toEqual(["a", "b"]);
  });

  test("and() composition: static where AND pk IN (...) in the scoped refill", async () => {
    const { db, calls } = fakeDb();
    const { serverOpts } = compileQuery({
      from: rows,
      select: { id: rows.id },
      where: eq(rows.n, 1),
      db,
    });
    // Full: just the static where.
    await serverOpts.loader({});
    expect(calls[0]!.sql).toBe(`select "id" from "rows" where "rows"."n" = $1`);
    // Scoped: static where AND pk IN (...).
    await serverOpts.loader({}, { affectedIds: ["a"] });
    expect(calls[1]!.sql).toBe(
      `select "id" from "rows" where ("rows"."n" = $1 and "rows"."id" in ($2))`,
    );
  });

  test("per-param where: (params) => SQL", async () => {
    const { db, calls } = fakeDb();
    const { serverOpts } = compileQuery<{ id: string }, { threadId: string }>({
      from: rows,
      select: { id: rows.id },
      where: (p) => eq(rows.parentId, p.threadId),
      db,
    });
    await serverOpts.loader({ threadId: "t1" });
    expect(calls[0]!.sql).toBe(
      `select "id" from "rows" where "rows"."parent_id" = $1`,
    );
    expect(calls[0]!.params).toEqual(["t1"]);
  });

  test("alias projection: scoped where uses the COLUMN, not the alias", async () => {
    const { db, calls } = fakeDb();
    const { serverOpts, keyField } = compileQuery({
      from: rows,
      identity: { pk: rows.parentId },
      select: { conversationId: rows.parentId, n: rows.n },
      db,
    });
    expect(keyField).toBe("conversationId");
    await serverOpts.loader({}, { affectedIds: ["x"] });
    expect(calls[0]!.sql).toBe(
      `select "parent_id", "n" from "rows" where "rows"."parent_id" in ($1)`,
    );
  });

  test("recompute:full — loader ignores affectedIds (always FULL), recompute policy", async () => {
    const { db, calls } = fakeDb();
    const { serverOpts, identityTableName } = compileQuery({
      from: rows,
      select: { id: rows.id, n: rows.n },
      orderBy: desc(rows.n),
      limit: 50,
      recompute: { kind: "full", reason: "windowed LIMIT read" },
      db,
    });
    expect(identityTableName).toBeNull();
    expect(serverOpts).toMatchObject({
      recompute: { kind: "full", reason: "windowed LIMIT read" },
    });
    expect("identityTable" in serverOpts).toBe(false);
    // Even with affectedIds, the FULL query runs (order + limit present, no IN).
    await serverOpts.loader({}, { affectedIds: ["a"] });
    expect(calls[0]!.sql).toBe(
      `select "id", "n" from "rows" order by "rows"."n" desc limit $1`,
    );
    expect(calls[0]!.params).toEqual([50]);
  });

  test("entity select-all default projects wireColumns", async () => {
    const { db, calls } = fakeDb();
    const { serverOpts } = compileQuery({ from: entity, db });
    await serverOpts.loader({});
    expect(calls[0]!.sql).toBe(`select "id", "n" from "rows"`);
  });
});

describe("rel() → dependsOn", () => {
  test("affectedMap self-queries the FK (selectDistinct) and maps ids", async () => {
    const { db, calls } = fakeDb(() => [{ fk: "p1" }, { fk: "p2" }]);
    const upstream = { key: "up" } as never;
    const edge = rel(upstream, rows, { fk: rows.parentId, upstreamPk: rows.id });
    const { serverOpts } = compileQuery({
      from: rows,
      select: { id: rows.id },
      edges: [edge],
      db,
    });
    const dep = serverOpts.dependsOn![0]!;
    const out = await dep.affectedMap!(new Set(["c1", "c2"]), {});
    expect(out).toEqual(["p1", "p2"]);
    expect(calls[0]!.sql).toBe(
      `select distinct "parent_id" from "rows" where "rows"."id" in ($1, $2)`,
    );
    expect(calls[0]!.params).toEqual(["c1", "c2"]);
  });

  test("signature passthrough", () => {
    const { db } = fakeDb();
    const signature = () => new Map([["u1", "sig"]]);
    const upstream = { key: "up" } as never;
    const edge = rel(upstream, rows, { fk: rows.parentId, upstreamPk: rows.id }, {
      signature,
    });
    const { serverOpts } = compileQuery({
      from: rows,
      select: { id: rows.id },
      edges: [edge],
      db,
    });
    expect(serverOpts.dependsOn![0]!.signature).toBe(signature);
  });
});

describe("queryResource — descriptor/keyField assertion", () => {
  test("throws loudly when queryPk disagrees with the derived keyField", () => {
    const { db } = fakeDb();
    // keyField derives to "id"; descriptor keys on "n" → mismatch → throw BEFORE
    // any real defineResource registration.
    const descriptor = queryResourceDescriptor(
      "qr-mismatch-test",
      z.object({ id: z.string(), n: z.number() }),
      "n",
    );
    expect(() =>
      queryResource(descriptor, { from: rows, select: { id: rows.id, n: rows.n }, db }),
    ).toThrow(/does not match the keyField "id"/);
  });
});
