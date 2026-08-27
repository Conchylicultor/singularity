import { test, expect, describe } from "bun:test";
import { z } from "zod";
import { PgDialect, pgTable } from "drizzle-orm/pg-core";
import { sql, type SQL } from "drizzle-orm";
import { parsedJson } from "@plugins/database/plugins/sql-column/server";
import { tagsFilterSql as ops } from "./tags-filter-sql";

const t = pgTable("t", { c: parsedJson("c", z.array(z.string())) });
// What `compileWhere` hands a builder: the column as a plain expression.
const target = sql`${t.c}`;
const dialect = new PgDialect();

function q(frag: SQL | undefined): { sql: string; params: unknown[] } | null {
  if (frag === undefined) return null;
  const { sql, params } = dialect.sqlToQuery(frag);
  return { sql, params };
}

describe("tags filter-sql", () => {
  test("operator ids match the web operator set exactly", () => {
    expect(Object.keys(ops).sort()).toEqual([
      "contains",
      "contains-all-of",
      "contains-any-of",
      "does-not-contain",
      "is-empty",
      "is-not-empty",
    ]);
  });

  test("contains → jsonb containment of a one-element array", () => {
    expect(q(ops.contains(target, "INBOX"))).toEqual({
      sql: '"t"."c" @> $1::jsonb',
      params: ['["INBOX"]'],
    });
  });

  test("empty / non-string scalar operand → undefined (rule dropped)", () => {
    expect(ops.contains(target, "")).toBeUndefined();
    expect(ops.contains(target, undefined)).toBeUndefined();
    expect(ops.contains(target, 3)).toBeUndefined();
    expect(ops["does-not-contain"](target, "")).toBeUndefined();
  });

  test("empty / non-list operand → undefined (rule dropped)", () => {
    expect(ops["contains-any-of"](target, [])).toBeUndefined();
    expect(ops["contains-any-of"](target, "x")).toBeUndefined();
    expect(ops["contains-all-of"](target, [])).toBeUndefined();
    // a list with no string members is just as incomplete
    expect(ops["contains-all-of"](target, [1, 2])).toBeUndefined();
  });

  test("does-not-contain KEEPS null rows (JS reads a missing value as [])", () => {
    const r = q(ops["does-not-contain"](target, "SPAM"));
    expect(r?.sql).toBe('("t"."c" IS NULL OR NOT ("t"."c" @> $1::jsonb))');
    expect(r?.params).toEqual(['["SPAM"]']);
  });

  test("contains-any-of → OR fold, one containment per tag", () => {
    const r = q(ops["contains-any-of"](target, ["a", 2, "b"]));
    expect(r?.sql).toBe('("t"."c" @> $1::jsonb or "t"."c" @> $2::jsonb)');
    expect(r?.params).toEqual(['["a"]', '["b"]']);
  });

  test("contains-any-of with a single tag → same shape as contains", () => {
    expect(q(ops["contains-any-of"](target, ["a"]))?.params).toEqual(['["a"]']);
    expect(q(ops["contains-any-of"](target, ["a"]))?.sql).toBe(
      '"t"."c" @> $1::jsonb',
    );
  });

  test("contains-all-of → ONE containment carrying the whole list", () => {
    const r = q(ops["contains-all-of"](target, ["a", "b"]));
    expect(r?.sql).toBe('"t"."c" @> $1::jsonb');
    expect(r?.params).toEqual(['["a","b"]']);
  });

  test("is-empty / is-not-empty project NULL and non-array to []", () => {
    const guard = `(CASE WHEN jsonb_typeof("t"."c") = 'array' THEN "t"."c" ELSE '[]'::jsonb END)`;
    expect(q(ops["is-empty"](target, undefined))?.sql).toBe(
      `jsonb_array_length(${guard}) = 0`,
    );
    expect(q(ops["is-not-empty"](target, undefined))?.sql).toBe(
      `jsonb_array_length(${guard}) > 0`,
    );
  });

  test("operands are bound as params, never spliced", () => {
    const r = q(ops.contains(target, `'); DROP TABLE t; --`));
    expect(r?.sql).toBe('"t"."c" @> $1::jsonb');
    expect(r?.params).toEqual([`["'); DROP TABLE t; --"]`]);
  });
});
