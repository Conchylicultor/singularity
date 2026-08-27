import { test, expect, describe } from "bun:test";
import { PgDialect, pgTable, boolean } from "drizzle-orm/pg-core";
import { sql, type SQL } from "drizzle-orm";
import { boolFilterSql as ops } from "./bool-filter-sql";

const t = pgTable("t", { c: boolean("c") });
// What `compileWhere` hands a builder: the column as a plain expression.
const target = sql`${t.c}`;
const dialect = new PgDialect();

function q(frag: SQL | undefined): { sql: string; params: unknown[] } | null {
  if (frag === undefined) return null;
  const { sql, params } = dialect.sqlToQuery(frag);
  return { sql, params };
}

describe("bool filter-sql", () => {
  test("is(true) → COALESCE(col,false) = true", () => {
    expect(q(ops.is(target, true))).toEqual({
      sql: 'COALESCE("t"."c", false) = $1',
      params: [true],
    });
  });

  test("absent / non-true operand reads as false (always complete)", () => {
    // Never undefined — a bool rule constrains rows even with no operand.
    expect(q(ops.is(target, undefined))?.params).toEqual([false]);
    expect(q(ops.is(target, false))?.params).toEqual([false]);
    expect(q(ops.is(target, "yes"))?.params).toEqual([false]);
  });

  test("is-not(true) → COALESCE(col,false) <> true", () => {
    expect(q(ops["is-not"](target, true))).toEqual({
      sql: 'COALESCE("t"."c", false) <> $1',
      params: [true],
    });
  });
});
