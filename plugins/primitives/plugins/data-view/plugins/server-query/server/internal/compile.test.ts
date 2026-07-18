import { describe, expect, it } from "bun:test";
import { sql, type SQL } from "drizzle-orm";
import {
  boolean,
  integer,
  PgDialect,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import type { FilterGroup } from "@plugins/primitives/plugins/data-view/core";
import {
  compileWhere,
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

const map: FieldColumnMap = {
  title: { col: t.title, type: "text" },
  status: { col: t.status, type: "enum" },
  createdAt: { col: t.createdAt, type: "date" },
  endedAt: { col: t.endedAt, type: "date", nullable: true },
  active: { col: t.active, type: "bool" },
  score: { col: t.score, type: "number" },
};

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
