import { describe, expect, it } from "bun:test";
import {
  and,
  clause,
  liveBoolean,
  liveInstant,
  liveNumber,
  liveStringArray,
  liveText,
  or,
  type Filter,
} from "./expr";
import { matchesFilter } from "./matches";
import { filterOps, type FilterOpId } from "./ops";

const filterable = {
  title: liveText(),
  count: liveNumber(),
  pinned: liveBoolean(),
  at: liveInstant(),
  tags: liveStringArray(),
};
type F = typeof filterable;

const m = (row: Record<string, unknown>, f: Filter<F> | undefined) =>
  matchesFilter(row, f, filterable);

describe("matchesFilter", () => {
  it("the absent filter matches everything; or:[] nothing", () => {
    expect(m({}, undefined)).toBe(true);
    expect(m({}, or<F>())).toBe(false);
  });

  it("evaluates and / or trees", () => {
    const f = or<F>(
      and<F>(clause("count", "gte", 2), clause("count", "lt", 5)),
      clause("title", "eqCi", "HELLO"),
    );
    expect(m({ count: 3, title: "x" }, f)).toBe(true);
    expect(m({ count: 9, title: "hello" }, f)).toBe(true);
    expect(m({ count: 9, title: "héllo" }, f)).toBe(false);
  });

  it("throws on a missing row field (null is a value, undefined is a bug)", () => {
    expect(() => m({}, clause("title", "isEmpty"))).toThrow(/no "title" field/);
    expect(m({ title: null }, clause("title", "isEmpty"))).toBe(true);
  });

  it("throws on a row value of the wrong type rather than answering false", () => {
    expect(() => m({ count: "3" }, clause("count", "eq", 3))).toThrow(
      /declared number/,
    );
    expect(() => m({ title: 3 }, clause("title", "eq", "3"))).toThrow(
      /declared text/,
    );
    expect(() => m({ at: "yesterday" }, clause("at", "isEmpty"))).toThrow(
      /declared instant/,
    );
    expect(() => m({ tags: [1] }, clause("tags", "isEmpty"))).toThrow(
      /declared stringArray/,
    );
  });

  it("NULL matches no positive op but isEmpty, and every negative op", () => {
    const row = {
      title: null,
      count: null,
      pinned: null,
      at: null,
      tags: null,
    };
    expect(m(row, clause("title", "ne", "x"))).toBe(true);
    expect(m(row, clause("title", "notIn", []))).toBe(true);
    expect(m(row, clause("count", "lt", 0))).toBe(false);
    expect(m(row, clause("count", "gte", 0))).toBe(false);
    expect(m(row, clause("pinned", "ne", true))).toBe(true);
    expect(m(row, clause("tags", "hasNone", ["a"]))).toBe(true);
    expect(m(row, clause("tags", "hasAll", []))).toBe(false);
  });

  it("text emptiness is ASCII whitespace only; case folding is ASCII only", () => {
    expect(m({ title: " \t\n" }, clause("title", "isEmpty"))).toBe(true);
    expect(m({ title: " " }, clause("title", "isEmpty"))).toBe(false);
    expect(m({ title: "École" }, clause("title", "contains", "cole"))).toBe(
      true,
    );
    expect(m({ title: "École" }, clause("title", "contains", "éCOLE"))).toBe(
      false,
    );
    expect(m({ title: "École" }, clause("title", "eqCi", "éCOLE"))).toBe(false);
    expect(m({ title: "École" }, clause("title", "eqCi", "ÉCOLE"))).toBe(true);
  });

  it("instants: Date or ISO-Z, µs truncated to ms", () => {
    const op = clause("at", "lte", "2026-01-01T00:00:00.000Z");
    expect(m({ at: new Date("2026-01-01T00:00:00.000Z") }, op)).toBe(true);
    expect(m({ at: "2026-01-01T00:00:00.000999Z" }, op)).toBe(true);
    expect(m({ at: "2026-01-01T00:00:00.001Z" }, op)).toBe(false);
  });

  it("a non-array set is empty and has nothing", () => {
    expect(m({ tags: "a" }, clause("tags", "isEmpty"))).toBe(true);
    expect(m({ tags: { a: 1 } }, clause("tags", "hasAny", ["a"]))).toBe(false);
    expect(m({ tags: [] }, clause("tags", "hasAll", []))).toBe(true);
    expect(m({ tags: ["a", "b"] }, clause("tags", "hasAll", ["a", "b"]))).toBe(
      true,
    );
    expect(m({ tags: ["a"] }, clause("tags", "hasAll", ["a", "b"]))).toBe(
      false,
    );
  });
});

describe("op table", () => {
  it("every negative op is a complement of a positive op of the same domains", () => {
    const negatives = Object.entries(filterOps).filter(
      ([, def]) => "complementOf" in def,
    );
    expect(negatives.map(([id]) => id).sort()).toEqual([
      "hasNone",
      "isNotEmpty",
      "ne",
      "neCi",
      "notContains",
      "notIn",
    ]);
    for (const [, def] of negatives) {
      const pos = filterOps[(def as { complementOf: FilterOpId }).complementOf];
      expect(def.domains).toEqual(pos.domains);
      expect(def.operand).toBe(pos.operand);
    }
  });
});
