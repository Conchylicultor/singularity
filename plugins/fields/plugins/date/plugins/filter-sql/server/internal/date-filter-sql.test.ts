import { test, expect, describe } from "bun:test";
import { PgDialect, pgTable, timestamp } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import {
  addUnits,
  resolveAnchorDay,
  withinRange,
} from "@plugins/fields/plugins/date/plugins/filter/core";
import { dateFilterSql as ops } from "./date-filter-sql";

const t = pgTable("t", { c: timestamp("c", { withTimezone: true }) });
const col = t.c;
const dialect = new PgDialect();

function q(frag: SQL | undefined): { sql: string; params: unknown[] } | null {
  if (frag === undefined) return null;
  const { sql, params } = dialect.sqlToQuery(frag);
  return { sql, params };
}

// Absolute anchors → deterministic, but resolve through the SAME core math the
// builder uses, so the expected epoch boundaries are TZ-independent.
const jan15 = { kind: "date", iso: "2026-01-15" } as const;
const day15 = resolveAnchorDay(jan15)!;
const day16 = addUnits(day15, "day", 1);

describe("date filter-sql (half-open day ranges)", () => {
  test("is → [day, nextDay) bound via to_timestamp", () => {
    const r = q(ops.is(col, jan15));
    expect(r?.sql).toBe(
      '("t"."c" >= to_timestamp($1 / 1000.0) AND "t"."c" < to_timestamp($2 / 1000.0))',
    );
    expect(r?.params).toEqual([day15, day16]);
  });

  test("is-before → col < day", () => {
    expect(q(ops["is-before"](col, jan15))).toEqual({
      sql: '"t"."c" < to_timestamp($1 / 1000.0)',
      params: [day15],
    });
  });

  test("is-after → col >= nextDay", () => {
    expect(q(ops["is-after"](col, jan15))?.params).toEqual([day16]);
  });

  test("is-on-or-before → col < nextDay", () => {
    expect(q(ops["is-on-or-before"](col, jan15))?.params).toEqual([day16]);
  });

  test("is-on-or-after → col >= day", () => {
    expect(q(ops["is-on-or-after"](col, jan15))?.params).toEqual([day15]);
  });

  test("empty / invalid operand → undefined (incomplete rule)", () => {
    expect(ops.is(col, null)).toBeUndefined();
    expect(ops.is(col, "")).toBeUndefined();
    expect(ops.is(col, "not-a-date")).toBeUndefined();
    expect(ops["is-on-or-after"](col, undefined)).toBeUndefined();
  });

  test("is-between → [from, nextDay(to)); inclusive-to whole day", () => {
    const from = { kind: "date", iso: "2026-01-10" } as const;
    const to = { kind: "date", iso: "2026-01-20" } as const;
    const r = q(ops["is-between"](col, { from, to }));
    expect(r?.params).toEqual([
      resolveAnchorDay(from)!,
      addUnits(resolveAnchorDay(to)!, "day", 1),
    ]);
  });

  test("is-between open bounds", () => {
    const from = { kind: "date", iso: "2026-01-10" } as const;
    expect(q(ops["is-between"](col, { from }))?.sql).toBe(
      '"t"."c" >= to_timestamp($1 / 1000.0)',
    );
    expect(ops["is-between"](col, {})).toBeUndefined();
    expect(ops["is-between"](col, undefined)).toBeUndefined();
  });

  test("is-within-past → [lo, nextDay(hi)) around today", () => {
    const operand = { unit: "day", amount: 3 } as const;
    const [lo, hi] = withinRange(operand, "past")!;
    const r = q(ops["is-within-past"](col, operand));
    expect(r?.sql).toBe(
      '("t"."c" >= to_timestamp($1 / 1000.0) AND "t"."c" < to_timestamp($2 / 1000.0))',
    );
    expect(r?.params).toEqual([lo, addUnits(hi, "day", 1)]);
  });

  test("is-within-next → [lo, nextDay(hi))", () => {
    const operand = { unit: "week", amount: 1 } as const;
    const [lo, hi] = withinRange(operand, "next")!;
    expect(q(ops["is-within-next"](col, operand))?.params).toEqual([
      lo,
      addUnits(hi, "day", 1),
    ]);
  });

  test("within: missing / non-positive amount → undefined", () => {
    expect(ops["is-within-past"](col, {})).toBeUndefined();
    expect(ops["is-within-past"](col, { unit: "day", amount: 0 })).toBeUndefined();
    expect(ops["is-within-next"](col, undefined)).toBeUndefined();
  });

  test("is-empty / is-not-empty → null checks", () => {
    expect(q(ops["is-empty"](col, undefined))).toEqual({
      sql: '"t"."c" IS NULL',
      params: [],
    });
    expect(q(ops["is-not-empty"](col, undefined))?.sql).toBe(
      '"t"."c" IS NOT NULL',
    );
  });
});
