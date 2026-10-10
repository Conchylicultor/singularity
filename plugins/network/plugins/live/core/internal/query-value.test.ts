import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { resourceDescriptorByKey } from "@plugins/primitives/plugins/live-state/core";
import { ResourceContractError } from "@plugins/packages/plugins/resource-protocol/core";
import {
  liveValue,
  type LivePagedSpec,
  type LivePagedValueSpec,
  type LiveQueryValueSpec,
} from "./live-value";
import { LIVE_QUERY_MAX_BYTES } from "./query-value";

const Result = z.object({ n: z.number() });
const Query = z.object({
  metric: z.string(),
  range: z.object({ preset: z.enum(["7d", "30d"]) }),
  tz: z.string().default("UTC"),
});

let seq = 0;
const key = (name: string) => `test.query-value.${name}.${seq++}`;

/** The gate's verdict on a tuple: ok, or the contract error's detail. */
function gate(
  v: { validateParams: (p: Record<string, string>) => void },
  params: Record<string, string>,
): "ok" | string {
  try {
    v.validateParams(params);
    return "ok";
  } catch (err) {
    if (err instanceof ResourceContractError) return err.detail;
    throw err;
  }
}

describe("liveValue — typed query", () => {
  test("declares a { q } value with its codec, registered", () => {
    const k = key("declare");
    const v = liveValue(k, { schema: Result, query: Query, load: "on-demand" });
    expect(v.live).toBe("value");
    expect(v.params).toEqual(["q"]);
    expect(v.load).toBe("on-demand");
    expect(v.preload).toBeUndefined();
    expect(resourceDescriptorByKey(k)).toBe(v);
  });

  test("encode then decode round-trips; key order and defaults fold into one tuple", () => {
    const v = liveValue(key("roundtrip"), { schema: Result, query: Query });
    const a = v.query.encode({ metric: "m", range: { preset: "7d" } });
    const b = v.query.encode({
      range: { preset: "7d" },
      metric: "m",
      tz: "UTC",
    });
    expect(a).toEqual(b);
    expect(a.q).toBe('{"metric":"m","range":{"preset":"7d"},"tz":"UTC"}');
    expect(v.query.decode(a)).toEqual({
      metric: "m",
      range: { preset: "7d" },
      tz: "UTC",
    });
    expect(gate(v, a)).toBe("ok");
  });

  test.each<[string, Record<string, string>, RegExp]>([
    [
      "a non-canonical q (key order)",
      { q: '{"range":{"preset":"7d"},"metric":"m","tz":"UTC"}' },
      /not canonical/,
    ],
    [
      "a q missing a default",
      { q: '{"metric":"m","range":{"preset":"7d"}}' },
      /not canonical/,
    ],
    [
      "an extra key",
      { q: '{"metric":"m","range":{"preset":"7d"},"tz":"UTC"}', x: "1" },
      /unknown param "x"/,
    ],
    ["a missing q", {}, /missing param "q"/],
    ["q not JSON", { q: "{" }, /not JSON/],
    [
      "a schema failure",
      { q: '{"metric":"m","range":{"preset":"1y"},"tz":"UTC"}' },
      /refused by the query schema/,
    ],
  ])("%s is a contract mismatch", (_name, params, detail) => {
    const v = liveValue(key("gate"), { schema: Result, query: Query });
    expect(gate(v, params)).toMatch(detail);
  });

  test("a schema whose parse is not idempotent is refused by the equality check", () => {
    const v = liveValue(key("transform"), {
      schema: Result,
      query: z.object({ n: z.number().transform((n) => n + 1) }),
    });
    // Encoding parses once ({ n: 1 } → { n: 2 }); the gate parses the wire
    // value again ({ n: 2 } → { n: 3 }), which is not the tuple.
    const params = v.query.encode({ n: 1 });
    expect(params.q).toBe('{"n":2}');
    expect(gate(v, params)).toMatch(/not canonical/);
  });

  test("a refinement passes — it checks, it does not rewrite", () => {
    const v = liveValue(key("refine"), {
      schema: Result,
      query: z.object({ tz: z.string().refine((s) => s !== "nope") }),
    });
    expect(gate(v, v.query.encode({ tz: "UTC" }))).toBe("ok");
    expect(() => v.query.encode({ tz: "nope" })).toThrow(
      /refused by its schema/,
    );
  });

  test("encoding a query the schema refuses throws a plain Error", () => {
    const v = liveValue(key("refused"), { schema: Result, query: Query });
    const bad = { metric: 1, range: { preset: "7d" } } as unknown as z.input<
      typeof Query
    >;
    expect(() => v.query.encode(bad)).toThrow(/refused by its schema/);
    expect(() => v.query.encode(bad)).not.toThrow(ResourceContractError);
  });

  test("encoding past LIVE_QUERY_MAX_BYTES throws", () => {
    const v = liveValue(key("size"), {
      schema: Result,
      query: z.object({ s: z.string() }),
    });
    expect(() =>
      v.query.encode({ s: "x".repeat(LIVE_QUERY_MAX_BYTES) }),
    ).toThrow(/LIVE_QUERY_MAX_BYTES/);
    expect(
      gate(v, { q: JSON.stringify({ s: "x".repeat(LIVE_QUERY_MAX_BYTES) }) }),
    ).toMatch(/over LIVE_QUERY_MAX_BYTES/);
  });

  test("a central query value carries its origin", () => {
    const v = liveValue(key("central"), {
      schema: Result,
      query: Query,
      origin: "central",
    });
    expect(v.origin).toBe("central");
  });

  test("types: query excludes params and preload", () => {
    type Spec = LiveQueryValueSpec<
      z.output<typeof Result>,
      z.output<typeof Query>,
      z.input<typeof Query>,
      "worktree"
    >;
    const both: Spec = {
      schema: Result,
      query: Query,
      // @ts-expect-error — `query` and `params` cannot both be declared
      params: ["id"],
    };
    const preloaded: Spec = {
      schema: Result,
      query: Query,
      // @ts-expect-error — a query value has no default tuple to preload
      preload: "boot",
    };
    expect([both, preloaded]).toHaveLength(2);
  });

  test("an untyped caller's stray params / preload throw", () => {
    expect(() =>
      liveValue(key("stray"), {
        schema: Result,
        query: Query,
        params: ["id"],
      } as never),
    ).toThrow(/cannot be declared beside `query`/);
  });
});

describe("liveValue — paged", () => {
  const Item = z.object({ id: z.string(), title: z.string() });
  const Meta = z.object({ total: z.number() });
  const Selector = z.object({ metric: z.string() });

  test("declares a { q, n, c? } value with a derived page schema", () => {
    const v = liveValue(key("paged"), {
      query: Selector,
      paged: { item: Item, id: "id", meta: Meta, limit: 50 },
    });
    expect(v.params).toEqual(["q", "n", "c"]);
    expect(v.optionalParams).toEqual(["c"]);
    expect(v.paged).toEqual({ id: "id", limit: 50 });
    expect(
      v.schema.parse({
        items: [{ id: "a", title: "A" }],
        nextCursor: null,
        meta: { total: 1 },
      }),
    ).toEqual({
      items: [{ id: "a", title: "A" }],
      nextCursor: null,
      meta: { total: 1 },
    });
    expect(() =>
      v.schema.parse({ items: [], nextCursor: "", meta: { total: 0 } }),
    ).toThrow();
  });

  test("a page tuple round-trips; the first page has no cursor", () => {
    const v = liveValue(key("paged-rt"), {
      query: Selector,
      paged: { item: Item, id: "id", limit: 50 },
    });
    const first = v.query.encode({ metric: "m" }, { cursor: null, limit: 5 });
    expect(first).toEqual({ q: '{"metric":"m"}', n: "5" });
    const next = v.query.encode({ metric: "m" }, { cursor: "abc", limit: 50 });
    expect(next).toEqual({ q: '{"metric":"m"}', n: "50", c: "abc" });
    expect(v.query.decode(next)).toEqual({
      query: { metric: "m" },
      cursor: "abc",
      limit: 50,
    });
    expect(gate(v, first)).toBe("ok");
  });

  test.each<[string, Record<string, string>, RegExp]>([
    [
      "n over the limit",
      { q: '{"metric":"m"}', n: "51" },
      /not an integer in 1..50/,
    ],
    ["n zero", { q: '{"metric":"m"}', n: "0" }, /not an integer/],
    ["n non-canonical", { q: '{"metric":"m"}', n: "05" }, /not an integer/],
    ["n missing", { q: '{"metric":"m"}' }, /missing param "n"/],
    ["an empty cursor", { q: '{"metric":"m"}', n: "5", c: "" }, /c is empty/],
    [
      "an over-long cursor",
      { q: '{"metric":"m"}', n: "5", c: "x".repeat(1025) },
      /c is empty or over/,
    ],
    [
      "an extra key",
      { q: '{"metric":"m"}', n: "5", x: "1" },
      /unknown param "x"/,
    ],
    ["a non-canonical q", { q: '{ "metric":"m"}', n: "5" }, /not canonical/],
  ])("%s is a contract mismatch", (_name, params, detail) => {
    const v = liveValue(key("paged-gate"), {
      query: Selector,
      paged: { item: Item, id: "id", limit: 50 },
    });
    expect(gate(v, params)).toMatch(detail);
  });

  test("encoding a page larger than the limit throws", () => {
    const v = liveValue(key("paged-big"), {
      query: Selector,
      paged: { item: Item, id: "id", limit: 50 },
    });
    expect(() =>
      v.query.encode({ metric: "m" }, { cursor: null, limit: 51 }),
    ).toThrow(/page size 51/);
  });

  test("a non-positive limit throws at declaration", () => {
    expect(() =>
      liveValue(key("paged-limit"), {
        query: Selector,
        paged: { item: Item, id: "id", limit: 0 },
      }),
    ).toThrow(/paged.limit 0/);
  });

  test("types: the id is a string field of the item; no schema beside paged", () => {
    type Paged = LivePagedSpec<z.output<typeof Item>, undefined>;
    const ok: Paged["id"] = "title";
    // @ts-expect-error — `title2` is not a field of the item
    const bad: Paged["id"] = "title2";
    type Spec = LivePagedValueSpec<
      z.output<typeof Item>,
      undefined,
      z.output<typeof Selector>,
      z.input<typeof Selector>,
      "worktree"
    >;
    const withSchema: Spec = {
      // @ts-expect-error — a paged value's schema is derived
      schema: Result,
      query: Selector,
      paged: { item: Item, id: "id", limit: 5 },
    };
    expect([ok, bad, withSchema]).toHaveLength(3);
  });
});
