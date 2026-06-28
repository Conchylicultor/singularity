import { test, expect, describe } from "bun:test";
import { PgDialect, pgTable, boolean } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { boolFilterSql as ops } from "./bool-filter-sql";

const t = pgTable("t", { c: boolean("c") });
const col = t.c;
const dialect = new PgDialect();

function q(frag: SQL | undefined): { sql: string; params: unknown[] } | null {
  if (frag === undefined) return null;
  const { sql, params } = dialect.sqlToQuery(frag);
  return { sql, params };
}

describe("bool filter-sql", () => {
  test("is(true) → COALESCE(col,false) = true", () => {
    expect(q(ops.is(col, true))).toEqual({
      sql: 'COALESCE("t"."c", false) = $1',
      params: [true],
    });
  });

  test("absent / non-true operand reads as false (always complete)", () => {
    // Never undefined — a bool rule constrains rows even with no operand.
    expect(q(ops.is(col, undefined))?.params).toEqual([false]);
    expect(q(ops.is(col, false))?.params).toEqual([false]);
    expect(q(ops.is(col, "yes"))?.params).toEqual([false]);
  });

  test("is-not(true) → COALESCE(col,false) <> true", () => {
    expect(q(ops["is-not"](col, true))).toEqual({
      sql: 'COALESCE("t"."c", false) <> $1',
      params: [true],
    });
  });
});
