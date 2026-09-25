import { describe, expect, it } from "bun:test";
import { z } from "zod";
import { canonicalizeFilter, decodeFilter, encodeFilter } from "./codec";
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

const STATUS = z.enum(["open", "done", "held"]);

const filterable = {
  status: liveText(STATUS),
  title: liveText(),
  count: liveNumber(),
  pinned: liveBoolean(),
  createdAt: liveInstant(),
  tags: liveStringArray(),
};
type F = typeof filterable;

const enc = (f: Filter<F> | undefined) => encodeFilter(f, filterable);

describe("canonical form", () => {
  it("permuted, nested and singleton spellings encode to the same bytes", () => {
    const a = clause("status", "eq", "open");
    const b = clause("count", "gt", 3);
    const c = clause("tags", "hasAny", ["x", "y"]);
    const canonical = enc(and<F>(a, b, c));
    expect(canonical).toBeDefined();
    expect(enc(and<F>(c, a, b))).toBe(canonical);
    expect(enc(and<F>(and<F>(b, a), c))).toBe(canonical);
    expect(enc(and<F>(and<F>(and<F>(c)), or<F>(a), b, a))).toBe(canonical);
  });

  it("sorts and dedupes list operands", () => {
    expect(enc(clause("status", "in", ["held", "done", "held"]))).toBe(
      `{"column":"status","op":"in","operand":["done","held"]}`,
    );
    expect(enc(clause("count", "in", [10, 2, 2, -1]))).toBe(
      `{"column":"count","op":"in","operand":[-1,2,10]}`,
    );
  });

  it("orders children by canonical JSON, and a clause's keys column/op/operand", () => {
    expect(
      enc(or<F>(clause("title", "isEmpty"), clause("count", "eq", 1))),
    ).toBe(
      `{"or":[{"column":"count","op":"eq","operand":1},{"column":"title","op":"isEmpty"}]}`,
    );
  });

  it("and:[] is the absent filter; or:[] matches nothing and absorbs into and", () => {
    expect(enc(and<F>())).toBeUndefined();
    expect(enc(undefined)).toBeUndefined();
    expect(enc(or<F>(clause("pinned", "eq", true), and<F>()))).toBeUndefined();
    expect(enc(or<F>())).toBe(`{"or":[]}`);
    expect(enc(and<F>(clause("pinned", "eq", true), or<F>()))).toBe(
      `{"or":[]}`,
    );
    expect(enc(or<F>(clause("pinned", "eq", true), or<F>()))).toBe(
      `{"column":"pinned","op":"eq","operand":true}`,
    );
  });

  it("respells instants as toISOString", () => {
    expect(enc(clause("createdAt", "gte", "2026-01-01T00:00:00Z"))).toBe(
      `{"column":"createdAt","op":"gte","operand":"2026-01-01T00:00:00.000Z"}`,
    );
    expect(enc(clause("createdAt", "gte", "2026-01-01T00:00:00.5Z"))).toBe(
      `{"column":"createdAt","op":"gte","operand":"2026-01-01T00:00:00.500Z"}`,
    );
  });

  it("canonicalizeFilter returns the canonical tree", () => {
    expect(
      canonicalizeFilter(
        and<F>(clause("count", "eq", 2), and<F>(clause("count", "eq", 2))),
        filterable,
      ),
    ).toEqual({ column: "count", op: "eq", operand: 2 });
  });
});

describe("strict decode", () => {
  const ok = `{"and":[{"column":"count","op":"gt","operand":3},{"column":"status","op":"eq","operand":"open"}]}`;

  it("round-trips the canonical encoding", () => {
    expect(encodeFilter(decodeFilter(ok, filterable), filterable)).toBe(ok);
  });

  const refused: [string, string][] = [
    ["an unknown column", `{"column":"secret","op":"eq","operand":"x"}`],
    [
      "an inherited property as column",
      `{"column":"toString","op":"eq","operand":"x"}`,
    ],
    [
      "an op the domain does not take",
      `{"column":"pinned","op":"lt","operand":true}`,
    ],
    [
      "eq on an instant",
      `{"column":"createdAt","op":"eq","operand":"2026-01-01T00:00:00.000Z"}`,
    ],
    [
      "contains on a number",
      `{"column":"count","op":"contains","operand":"1"}`,
    ],
    ["an unknown op", `{"column":"count","op":"isNull","operand":true}`],
    ["a wrong-type operand", `{"column":"count","op":"eq","operand":"3"}`],
    ["a null operand", `{"column":"title","op":"eq","operand":null}`],
    [
      "an operand on isEmpty",
      `{"column":"title","op":"isEmpty","operand":true}`,
    ],
    [
      "a scalar for a list op",
      `{"column":"status","op":"in","operand":"open"}`,
    ],
    [
      "a µs instant operand",
      `{"column":"createdAt","op":"gt","operand":"2026-01-01T00:00:00.000001Z"}`,
    ],
    [
      "an out-of-range date",
      `{"column":"createdAt","op":"gt","operand":"2026-02-30T00:00:00.000Z"}`,
    ],
    [
      "an offset instant",
      `{"column":"createdAt","op":"gt","operand":"2026-01-01T00:00:00.000+01:00"}`,
    ],
    ["an extra clause key", `{"column":"count","op":"eq","operand":1,"x":1}`],
    ["a two-key group", `{"and":[],"or":[]}`],
    [
      "a non-canonical child order",
      `{"and":[{"column":"status","op":"eq","operand":"open"},{"column":"count","op":"gt","operand":3}]}`,
    ],
    ["a singleton group", `{"and":[{"column":"count","op":"gt","operand":3}]}`],
    [
      "an unsorted list",
      `{"column":"status","op":"in","operand":["open","done"]}`,
    ],
    ["whitespace", `{"column":"count", "op":"gt","operand":3}`],
    ["the absent filter", `{"and":[]}`],
    ["invalid JSON", `{"column":`],
    [
      "a non-canonical instant",
      `{"column":"createdAt","op":"gt","operand":"2026-01-01T00:00:00Z"}`,
    ],
  ];
  for (const [what, json] of refused) {
    it(`throws on ${what}`, () => {
      expect(() => decodeFilter(json, filterable)).toThrow();
    });
  }

  it("throws over the depth cap (4 group levels)", () => {
    const leaf = (n: number) => clause("count", "eq", n);
    let f: Filter<F> = or<F>(leaf(0), leaf(1));
    for (let depth = 2; depth <= 4; depth++) {
      f =
        depth % 2 === 0
          ? and<F>(f, leaf(depth * 10))
          : or<F>(f, leaf(depth * 10));
    }
    expect(enc(f)).toBeDefined();
    const tooDeep = or<F>(f, leaf(99));
    expect(() => enc(tooDeep)).toThrow(/levels deep/);
  });

  it("throws over the clause cap (50)", () => {
    const clauses = (n: number) =>
      Array.from({ length: n }, (_, i) => clause("count", "eq", i));
    expect(enc(or<F>(...clauses(50)))).toBeDefined();
    expect(() => enc(or<F>(...clauses(51)))).toThrow(/clauses/);
  });

  it("throws over the list cap (100)", () => {
    const list = (n: number) => Array.from({ length: n }, (_, i) => i);
    expect(enc(clause("count", "in", list(100)))).toBeDefined();
    expect(() => enc(clause("count", "in", list(101)))).toThrow(/exceeds 100/);
  });

  it("a stale enum operand decodes and matches nothing", () => {
    const f = decodeFilter(
      `{"column":"status","op":"eq","operand":"archived"}`,
      filterable,
    );
    const row = { status: "open" };
    expect(matchesFilter(row, f, filterable)).toBe(false);
  });
});

describe("types", () => {
  it("rejects undeclared columns, wrong-domain ops and wrong operands in tsc", () => {
    const typed: Filter<F>[] = [
      { column: "status", op: "in", operand: ["open"] },
      { column: "title", op: "contains", operand: "anything" },
      // A pattern op is not narrowed to the enum.
      { column: "status", op: "eqCi", operand: "OPEN" },
      { column: "tags", op: "hasAll", operand: ["a"] },
      { column: "pinned", op: "isEmpty" },
      // @ts-expect-error — undeclared column
      { column: "secret", op: "eq", operand: "x" },
      // @ts-expect-error — an enum operand outside the narrow
      { column: "status", op: "eq", operand: "archived" },
      // @ts-expect-error — booleans take no range op
      { column: "pinned", op: "lt", operand: true },
      // @ts-expect-error — a number operand on a text column
      { column: "title", op: "eq", operand: 1 },
      // @ts-expect-error — instants take no eq
      { column: "createdAt", op: "eq", operand: "2026-01-01T00:00:00.000Z" },
    ];
    expect(typed.length).toBe(10);
  });
});
