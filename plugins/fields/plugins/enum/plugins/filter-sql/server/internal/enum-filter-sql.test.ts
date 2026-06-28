import { test, expect, describe } from "bun:test";
import { PgDialect, pgTable, text } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { enumFilterSql as ops } from "./enum-filter-sql";

const t = pgTable("t", { c: text("c") });
const col = t.c;
const dialect = new PgDialect();

function q(frag: SQL | undefined): { sql: string; params: unknown[] } | null {
  if (frag === undefined) return null;
  const { sql, params } = dialect.sqlToQuery(frag);
  return { sql, params };
}

describe("enum filter-sql", () => {
  test("is → case-sensitive equality", () => {
    expect(q(ops.is(col, "open"))).toEqual({
      sql: '"t"."c" = $1',
      params: ["open"],
    });
  });

  test("empty / non-string scalar operand → undefined", () => {
    expect(ops.is(col, "")).toBeUndefined();
    expect(ops.is(col, undefined)).toBeUndefined();
    expect(ops["is-not"](col, "")).toBeUndefined();
  });

  test("empty list operand → undefined", () => {
    expect(ops["is-any-of"](col, [])).toBeUndefined();
    expect(ops["is-any-of"](col, "x")).toBeUndefined();
    expect(ops["is-none-of"](col, [])).toBeUndefined();
  });

  test("is-not KEEPS null rows", () => {
    const r = q(ops["is-not"](col, "open"));
    expect(r?.sql).toBe('("t"."c" IS NULL OR "t"."c" <> $1)');
    expect(r?.params).toEqual(["open"]);
  });

  test("is-any-of → IN over filtered string list", () => {
    const r = q(ops["is-any-of"](col, ["a", 2, "b"]));
    expect(r?.sql).toBe('"t"."c" in ($1, $2)');
    expect(r?.params).toEqual(["a", "b"]);
  });

  test("is-none-of → NOT IN, but KEEPS null rows", () => {
    const r = q(ops["is-none-of"](col, ["a", "b"]));
    expect(r?.sql).toBe('("t"."c" IS NULL OR "t"."c" not in ($1, $2))');
    expect(r?.params).toEqual(["a", "b"]);
  });

  test("is-empty → null or empty string", () => {
    expect(q(ops["is-empty"](col, undefined))?.sql).toBe(
      `("t"."c" IS NULL OR "t"."c" = '')`,
    );
  });

  test("is-not-empty → non-null and non-empty", () => {
    expect(q(ops["is-not-empty"](col, undefined))?.sql).toBe(
      `("t"."c" IS NOT NULL AND "t"."c" <> '')`,
    );
  });
});
