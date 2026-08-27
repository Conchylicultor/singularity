import { test, expect, describe } from "bun:test";
import { PgDialect, pgTable, integer } from "drizzle-orm/pg-core";
import { sql, type SQL } from "drizzle-orm";
import { numberFilterSql as ops } from "./number-filter-sql";

const t = pgTable("t", { c: integer("c") });
// What `compileWhere` hands a builder: the column as a plain expression.
const target = sql`${t.c}`;
const dialect = new PgDialect();

function q(frag: SQL | undefined): { sql: string; params: unknown[] } | null {
  if (frag === undefined) return null;
  const { sql, params } = dialect.sqlToQuery(frag);
  return { sql, params };
}

describe("number filter-sql", () => {
  test("comparison operators bind the operand", () => {
    expect(q(ops["="](target, 5))).toEqual({
      sql: '"t"."c" = $1',
      params: [5],
    });
    expect(q(ops["≠"](target, 5))?.sql).toBe('"t"."c" <> $1');
    expect(q(ops[">"](target, 5))?.sql).toBe('"t"."c" > $1');
    expect(q(ops["<"](target, 5))?.sql).toBe('"t"."c" < $1');
    expect(q(ops["≥"](target, 5))?.sql).toBe('"t"."c" >= $1');
    expect(q(ops["≤"](target, 5))?.sql).toBe('"t"."c" <= $1');
  });

  test("non-finite / absent operand → undefined (incomplete rule)", () => {
    expect(ops["="](target, undefined)).toBeUndefined();
    expect(ops["="](target, NaN)).toBeUndefined();
    expect(ops["="](target, Infinity)).toBeUndefined();
    expect(ops["="](target, "5")).toBeUndefined();
  });

  test("≠ excludes null rows (no IS NULL branch, unlike text is-not)", () => {
    expect(q(ops["≠"](target, 5))?.sql).toBe('"t"."c" <> $1');
  });

  test("between: both bounds", () => {
    expect(q(ops.between(target, { min: 1, max: 9 }))).toEqual({
      sql: '("t"."c" >= $1 and "t"."c" <= $2)',
      params: [1, 9],
    });
  });

  test("between: open bounds (only min / only max)", () => {
    expect(q(ops.between(target, { min: 1 }))?.sql).toBe('"t"."c" >= $1');
    expect(q(ops.between(target, { max: 9 }))?.sql).toBe('"t"."c" <= $1');
  });

  test("between: no usable bounds → undefined", () => {
    expect(ops.between(target, {})).toBeUndefined();
    expect(ops.between(target, undefined)).toBeUndefined();
    expect(ops.between(target, { min: "x" })).toBeUndefined();
  });

  test("is-empty / is-not-empty → null checks, no params", () => {
    expect(q(ops["is-empty"](target, undefined))).toEqual({
      sql: '"t"."c" IS NULL',
      params: [],
    });
    expect(q(ops["is-not-empty"](target, undefined))?.sql).toBe(
      '"t"."c" IS NOT NULL',
    );
  });
});
