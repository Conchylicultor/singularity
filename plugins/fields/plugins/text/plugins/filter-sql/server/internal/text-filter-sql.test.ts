import { test, expect, describe } from "bun:test";
import { PgDialect, pgTable, text } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { textFilterSql as ops } from "./text-filter-sql";

const t = pgTable("t", { c: text("c") });
const col = t.c;
const dialect = new PgDialect();

/** Render a fragment to `{ sql, params }`, or null when the builder dropped it. */
function q(frag: SQL | undefined): { sql: string; params: unknown[] } | null {
  if (frag === undefined) return null;
  const { sql, params } = dialect.sqlToQuery(frag);
  return { sql, params };
}

describe("text filter-sql", () => {
  test("contains → ILIKE with escaped %-wrapped param", () => {
    const r = q(ops.contains(col, "foo"));
    expect(r).toEqual({ sql: '"t"."c" ILIKE $1', params: ["%foo%"] });
  });

  test("contains escapes LIKE wildcards", () => {
    expect(q(ops.contains(col, "50%_x\\"))?.params).toEqual(["%50\\%\\_x\\\\%"]);
  });

  test("empty operand → undefined (keep-all, incomplete rule)", () => {
    expect(ops.contains(col, "")).toBeUndefined();
    expect(ops.contains(col, undefined)).toBeUndefined();
    expect(ops["does-not-contain"](col, "")).toBeUndefined();
    expect(ops.is(col, "")).toBeUndefined();
    expect(ops["is-not"](col, "")).toBeUndefined();
  });

  test("does-not-contain KEEPS null rows", () => {
    const r = q(ops["does-not-contain"](col, "foo"));
    expect(r?.sql).toBe('("t"."c" IS NULL OR "t"."c" NOT ILIKE $1)');
    expect(r?.params).toEqual(["%foo%"]);
  });

  test("is → case-insensitive equality", () => {
    const r = q(ops.is(col, "Foo"));
    expect(r).toEqual({ sql: 'lower("t"."c") = lower($1)', params: ["Foo"] });
  });

  test("is-not KEEPS null rows", () => {
    const r = q(ops["is-not"](col, "Foo"));
    expect(r?.sql).toBe('("t"."c" IS NULL OR lower("t"."c") <> lower($1))');
    expect(r?.params).toEqual(["Foo"]);
  });

  test("is-empty (null or whitespace-only), no params", () => {
    const r = q(ops["is-empty"](col, undefined));
    expect(r?.sql).toBe('("t"."c" IS NULL OR "t"."c" ~ $1)');
    expect(r?.params).toEqual(["^[[:space:]]*$"]);
  });

  test("is-not-empty (non-null and not whitespace-only)", () => {
    const r = q(ops["is-not-empty"](col, undefined));
    expect(r?.sql).toBe('("t"."c" IS NOT NULL AND "t"."c" !~ $1)');
  });
});
