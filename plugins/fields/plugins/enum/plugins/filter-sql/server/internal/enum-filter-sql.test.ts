import { test, expect, describe } from "bun:test";
import { z } from "zod";
import { PgDialect, pgTable, text } from "drizzle-orm/pg-core";
import { sql, type SQL } from "drizzle-orm";
import {
  parsedText,
  SqlColumnError,
} from "@plugins/database/plugins/sql-column/server";
import { enumFilterSql as ops } from "./enum-filter-sql";

const t = pgTable("t", { c: text("c") });
// What `compileWhere` hands a builder: the column as a plain expression.
const target = sql`${t.c}`;
const dialect = new PgDialect();

function q(frag: SQL | undefined): { sql: string; params: unknown[] } | null {
  if (frag === undefined) return null;
  const { sql, params } = dialect.sqlToQuery(frag);
  return { sql, params };
}

describe("enum filter-sql", () => {
  test("is → case-sensitive equality", () => {
    expect(q(ops.is(target, "open"))).toEqual({
      sql: '"t"."c" = $1',
      params: ["open"],
    });
  });

  test("empty / non-string scalar operand → undefined", () => {
    expect(ops.is(target, "")).toBeUndefined();
    expect(ops.is(target, undefined)).toBeUndefined();
    expect(ops["is-not"](target, "")).toBeUndefined();
  });

  test("empty list operand → undefined", () => {
    expect(ops["is-any-of"](target, [])).toBeUndefined();
    expect(ops["is-any-of"](target, "x")).toBeUndefined();
    expect(ops["is-none-of"](target, [])).toBeUndefined();
  });

  test("is-not KEEPS null rows", () => {
    const r = q(ops["is-not"](target, "open"));
    expect(r?.sql).toBe('("t"."c" IS NULL OR "t"."c" <> $1)');
    expect(r?.params).toEqual(["open"]);
  });

  test("is-any-of → IN over filtered string list", () => {
    const r = q(ops["is-any-of"](target, ["a", 2, "b"]));
    expect(r?.sql).toBe('"t"."c" in ($1, $2)');
    expect(r?.params).toEqual(["a", "b"]);
  });

  test("is-none-of → NOT IN, but KEEPS null rows", () => {
    const r = q(ops["is-none-of"](target, ["a", "b"]));
    expect(r?.sql).toBe('("t"."c" IS NULL OR "t"."c" not in ($1, $2))');
    expect(r?.params).toEqual(["a", "b"]);
  });

  test("is-empty → null or empty string", () => {
    expect(q(ops["is-empty"](target, undefined))?.sql).toBe(
      `("t"."c" IS NULL OR "t"."c" = '')`,
    );
  });

  test("is-not-empty → non-null and non-empty", () => {
    expect(q(ops["is-not-empty"](target, undefined))?.sql).toBe(
      `("t"."c" IS NOT NULL AND "t"."c" <> '')`,
    );
  });

  // The regression this whole target contract exists for. A saved view can name
  // an option the enum no longer has, and comparing a column against a value it
  // can never hold is meaningful SQL ("nothing matches") — not a write to reject.
  // Through the COLUMN it was a 500; through the target it is a query.
  describe("against a decoded (parsedText) column", () => {
    const d = pgTable("d", {
      status: parsedText("status", z.enum(["open", "done"])),
    });
    const decoded = sql`${d.status}`;

    test("an out-of-domain operand renders, and renders like any other", () => {
      const stale = q(ops["is-any-of"](decoded, ["gone"]));
      expect(stale).toEqual({ sql: '"d"."status" in ($1)', params: ["gone"] });
      // Byte-for-byte what a live option produces — the operand is just a param.
      expect(q(ops["is-any-of"](decoded, ["open"]))?.sql).toBe(stale?.sql);
    });

    test("the column itself rejects the operand — which is why it never sees one", () => {
      // What a builder would hit if it were handed the column: every drizzle
      // comparison helper binds through the column it compares against, which
      // runs the column's WRITE-side schema. Reaching for it is now a type
      // error too (`inArray(d.status, ["gone"])` does not compile — `"gone"` is
      // not one of the column's values), so this reproduces the one way the
      // value really arrives: laundered past `tsc`, straight off a request body.
      const fromRequestBody = "gone" as "open" | "done";
      expect(() => d.status.mapToDriverValue(fromRequestBody)).toThrow(
        SqlColumnError,
      );
    });
  });
});
