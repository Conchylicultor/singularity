import { describe, expect, it } from "bun:test";
import { sql, type AnyColumn, type SQL } from "drizzle-orm";
import {
  boolean,
  integer,
  PgDialect,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import type {
  FilterGroup,
  SortRule,
} from "@plugins/primitives/plugins/data-view/core";
import {
  buildSortKeys,
  compileWhere,
  keyValuesOf,
  orderByClauses,
  seekPredicate,
  type FieldColumnMap,
  type OperatorSqlResolver,
} from "./compile";

// Throwaway physical schema purely for SQL rendering in tests.
const t = pgTable("things", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  status: text("status").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  endedAt: timestamp("ended_at", { withTimezone: true }), // NULLABLE
  active: boolean("active").notNull(),
  score: integer("score").notNull(),
});

const dialect = new PgDialect();
const render = (s: SQL) => dialect.sqlToQuery(s);
const renderSql = (s: SQL | undefined) => (s ? render(s).sql : undefined);

const map: FieldColumnMap = {
  title: { col: t.title, type: "text" },
  status: { col: t.status, type: "enum" },
  createdAt: { col: t.createdAt, type: "date" },
  endedAt: { col: t.endedAt, type: "date", nullable: true },
  active: { col: t.active, type: "bool" },
  score: { col: t.score, type: "number" },
};

const tiebreaker = { col: t.id as AnyColumn, fieldId: "id" };

// A tiny resolver covering just the operators the tests exercise.
const resolve: OperatorSqlResolver = (typeId, operatorId) => {
  if (typeId === "text" && operatorId === "contains") {
    return (col, operand) => {
      if (typeof operand !== "string" || operand === "") return undefined; // incomplete → dropped
      return sql`${col} ILIKE ${"%" + operand + "%"}`;
    };
  }
  if (typeId === "enum" && operatorId === "is") {
    return (col, operand) =>
      operand == null ? undefined : sql`${col} = ${operand}`;
  }
  if (typeId === "bool" && operatorId === "is") {
    return (col, operand) => sql`${col} = ${operand === true}`;
  }
  if (typeId === "number" && operatorId === "gt") {
    return (col, operand) =>
      typeof operand === "number" ? sql`${col} > ${operand}` : undefined;
  }
  return null; // unknown type/operator → rule dropped
};

const group = (
  conjunction: "and" | "or",
  ...children: FilterGroup["children"]
): FilterGroup => ({ kind: "group", id: "g", conjunction, children });

describe("compileWhere", () => {
  it("returns undefined for a null filter", () => {
    expect(compileWhere(null, map, resolve)).toBeUndefined();
  });

  it("returns undefined for an empty group", () => {
    expect(compileWhere(group("and"), map, resolve)).toBeUndefined();
  });

  it("compiles a single text-contains rule (escaped param)", () => {
    const f = group("and", {
      kind: "rule",
      id: "r",
      fieldId: "title",
      operatorId: "contains",
      value: "hi",
    });
    const q = render(compileWhere(f, map, resolve)!);
    expect(q.sql).toBe(`"things"."title" ILIKE $1`);
    expect(q.params).toEqual(["%hi%"]);
  });

  it("drops an incomplete rule (empty operand) → undefined", () => {
    const f = group("and", {
      kind: "rule",
      id: "r",
      fieldId: "title",
      operatorId: "contains",
      value: "",
    });
    expect(compileWhere(f, map, resolve)).toBeUndefined();
  });

  it("drops an unmapped field rule", () => {
    const f = group("and", {
      kind: "rule",
      id: "r",
      fieldId: "nope",
      operatorId: "contains",
      value: "x",
    });
    expect(compileWhere(f, map, resolve)).toBeUndefined();
  });

  it("drops a rule whose operator the resolver doesn't know", () => {
    const f = group("and", {
      kind: "rule",
      id: "r",
      fieldId: "title",
      operatorId: "unknown-op",
      value: "x",
    });
    expect(compileWhere(f, map, resolve)).toBeUndefined();
  });

  it("collapses a single surviving child (no AND/OR wrapper)", () => {
    const f = group(
      "and",
      {
        kind: "rule",
        id: "r1",
        fieldId: "title",
        operatorId: "contains",
        value: "hi",
      },
      {
        kind: "rule",
        id: "r2",
        fieldId: "title",
        operatorId: "contains",
        value: "", // dropped
      },
    );
    const q = render(compileWhere(f, map, resolve)!);
    expect(q.sql).toBe(`"things"."title" ILIKE $1`);
  });

  it("compiles nested AND-of-OR", () => {
    const f = group(
      "and",
      group(
        "or",
        {
          kind: "rule",
          id: "r1",
          fieldId: "status",
          operatorId: "is",
          value: "open",
        },
        {
          kind: "rule",
          id: "r2",
          fieldId: "status",
          operatorId: "is",
          value: "closed",
        },
      ),
      {
        kind: "rule",
        id: "r3",
        fieldId: "score",
        operatorId: "gt",
        value: 5,
      },
    );
    const q = render(compileWhere(f, map, resolve)!);
    expect(q.sql).toBe(
      `(("things"."status" = $1 or "things"."status" = $2) and "things"."score" > $3)`,
    );
    expect(q.params).toEqual(["open", "closed", 5]);
  });
});

describe("buildSortKeys", () => {
  it("appends the PK tiebreaker (asc, non-null)", () => {
    const sort: SortRule[] = [{ fieldId: "createdAt", direction: "desc" }];
    const keys = buildSortKeys(sort, map, tiebreaker);
    expect(keys.map((k) => k.fieldId)).toEqual(["createdAt", "id"]);
    expect(keys[1]).toMatchObject({ fieldId: "id", dir: "asc", nullable: false });
  });

  it("skips unmapped sort fields", () => {
    const sort: SortRule[] = [
      { fieldId: "ghost", direction: "asc" },
      { fieldId: "title", direction: "asc" },
    ];
    expect(buildSortKeys(sort, map, tiebreaker).map((k) => k.fieldId)).toEqual([
      "title",
      "id",
    ]);
  });

  it("does not double-append when sort already targets the PK", () => {
    const sort: SortRule[] = [{ fieldId: "id", direction: "desc" }];
    const keys = buildSortKeys(
      sort,
      { ...map, id: { col: t.id, type: "text" } },
      tiebreaker,
    );
    expect(keys.map((k) => k.fieldId)).toEqual(["id"]);
    expect(keys[0]!.dir).toBe("desc");
  });

  it("carries the nullable flag from the binding", () => {
    const keys = buildSortKeys(
      [{ fieldId: "endedAt", direction: "desc" }],
      map,
      tiebreaker,
    );
    expect(keys[0]).toMatchObject({ fieldId: "endedAt", nullable: true });
  });
});

describe("orderByClauses", () => {
  it("emits explicit NULLS LAST on every key, both directions", () => {
    const keys = buildSortKeys(
      [{ fieldId: "endedAt", direction: "desc" }],
      map,
      tiebreaker,
    );
    const rendered = orderByClauses(keys).map(renderSql);
    expect(rendered).toEqual([
      `"things"."ended_at" DESC NULLS LAST`,
      `"things"."id" ASC NULLS LAST`,
    ]);
  });

  it("asc key renders ASC NULLS LAST", () => {
    const keys = buildSortKeys(
      [{ fieldId: "title", direction: "asc" }],
      map,
      tiebreaker,
    );
    expect(orderByClauses(keys).map(renderSql)).toEqual([
      `"things"."title" ASC NULLS LAST`,
      `"things"."id" ASC NULLS LAST`,
    ]);
  });
});

describe("seekPredicate", () => {
  it("returns undefined for the first page (null cursor)", () => {
    const keys = buildSortKeys(
      [{ fieldId: "createdAt", direction: "desc" }],
      map,
      tiebreaker,
    );
    expect(seekPredicate(keys, null)).toBeUndefined();
  });

  it("single non-nullable desc key + PK tiebreaker", () => {
    const keys = buildSortKeys(
      [{ fieldId: "createdAt", direction: "desc" }],
      map,
      tiebreaker,
    );
    const d = new Date("2026-01-01T00:00:00.000Z");
    const q = render(seekPredicate(keys, [d, "abc"])!);
    // OR_0: after(createdAt) ; OR_1: eq(createdAt) AND after(id)
    expect(q.sql).toBe(
      `("things"."created_at" < $1 or ("things"."created_at" = $2 and "things"."id" > $3))`,
    );
    expect(q.params).toEqual([d, d, "abc"]);
  });

  it("ascending key uses > and ascending PK uses >", () => {
    const keys = buildSortKeys(
      [{ fieldId: "title", direction: "asc" }],
      map,
      tiebreaker,
    );
    const q = render(seekPredicate(keys, ["m", "id-5"])!);
    expect(q.sql).toBe(
      `("things"."title" > $1 or ("things"."title" = $2 and "things"."id" > $3))`,
    );
    expect(q.params).toEqual(["m", "m", "id-5"]);
  });

  // THE SEAM CASE: nullable desc sort column with a NON-NULL cursor value must
  // include the trailing NULL rows in the after-term (NULLS LAST), else the
  // entire null region is skipped at the seam.
  it("nullable desc key with a non-null cursor includes OR IS NULL", () => {
    const keys = buildSortKeys(
      [{ fieldId: "endedAt", direction: "desc" }],
      map,
      tiebreaker,
    );
    const d = new Date("2026-03-03T00:00:00.000Z");
    const q = render(seekPredicate(keys, [d, "abc"])!);
    expect(q.sql).toBe(
      `(("things"."ended_at" < $1 OR "things"."ended_at" IS NULL) or ("things"."ended_at" = $2 and "things"."id" > $3))`,
    );
    expect(q.params).toEqual([d, d, "abc"]);
  });

  // THE NULL-BOUNDARY CASE: cursor value on the nullable key is itself NULL (we
  // are mid-scroll inside the trailing null region). The after-term on that key
  // is dropped; the eq-term becomes `IS NULL` and the seek falls through to the
  // PK tiebreaker only.
  it("nullable key with a NULL cursor value falls through to the PK", () => {
    const keys = buildSortKeys(
      [{ fieldId: "endedAt", direction: "desc" }],
      map,
      tiebreaker,
    );
    const q = render(seekPredicate(keys, [null, "abc"])!);
    // OR_0 (after endedAt) dropped; only OR_1: eq(endedAt IS NULL) AND id > $
    expect(q.sql).toBe(`("things"."ended_at" IS NULL and "things"."id" > $1)`);
    expect(q.params).toEqual(["abc"]);
  });

  it("two-level sort: eq-chain across both keys then PK", () => {
    const keys = buildSortKeys(
      [
        { fieldId: "status", direction: "asc" },
        { fieldId: "createdAt", direction: "desc" },
      ],
      map,
      tiebreaker,
    );
    const d = new Date("2026-02-02T00:00:00.000Z");
    const q = render(seekPredicate(keys, ["open", d, "abc"])!);
    expect(q.sql).toBe(
      `("things"."status" > $1 or ("things"."status" = $2 and "things"."created_at" < $3) or ("things"."status" = $4 and "things"."created_at" = $5 and "things"."id" > $6))`,
    );
    expect(q.params).toEqual(["open", "open", d, "open", d, "abc"]);
  });
});

describe("keyValuesOf", () => {
  it("extracts the tuple in key order by fieldId", () => {
    const keys = buildSortKeys(
      [{ fieldId: "endedAt", direction: "desc" }],
      map,
      tiebreaker,
    );
    const d = new Date("2026-04-04T00:00:00.000Z");
    const row = { endedAt: d, id: "abc", title: "ignored" };
    expect(keyValuesOf(row, keys)).toEqual([d, "abc"]);
  });

  it("honors an explicit fieldId override list", () => {
    const keys = buildSortKeys(
      [{ fieldId: "createdAt", direction: "desc" }],
      map,
      tiebreaker,
    );
    const row = { ts: 1, pk: "z" };
    expect(keyValuesOf(row, keys, ["ts", "pk"])).toEqual([1, "z"]);
  });
});
