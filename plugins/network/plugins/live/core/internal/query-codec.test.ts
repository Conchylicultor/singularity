import { describe, expect, it } from "bun:test";
import { z } from "zod";
import type { WindowQueryResourceContract } from "@plugins/infra/plugins/query-resource/core";
import { liveCollection } from "./live-collection";

const RowSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.enum(["running", "error", "idle"]),
  enabled: z.boolean(),
  count: z.number().nullable(),
  createdAt: z.string(),
});
type Row = z.infer<typeof RowSchema>;

const sources = liveCollection("live-test.codec", {
  row: RowSchema,
  id: "id",
  filterable: {
    status: z.enum(["running", "error", "idle"]),
    enabled: z.boolean(),
    count: z.number(),
  },
  sortable: ["createdAt", "name"],
  default: { orderBy: [["createdAt", "desc"]], limit: 100 },
  maxLimit: 500,
});
const { encode, decode } = sources.window.window;

// Compile-time: the collection's window is still a limit-codec window contract,
// so the existing compiler and window hooks accept it unchanged.
const _asContract: WindowQueryResourceContract<Row> = sources.window;

describe("liveCollection", () => {
  it("mints the window key and its :rows point sibling", () => {
    expect(sources.window.key).toBe("live-test.codec");
    expect(sources.rows.key).toBe("live-test.codec:rows");
    expect(sources.window.defaultParams).toEqual({ limit: "100" });
    expect(sources.window.window.maxLimit).toBe(500);
    expect(_asContract.window.decode({ limit: "7" }).limit).toBe(7);
  });

  it("rejects undeclared columns at the type level", () => {
    liveCollection("live-test.bad-filter", {
      row: RowSchema,
      id: "id",
      // @ts-expect-error — "bogus" is not a row field
      filterable: { bogus: z.string() },
      sortable: ["name"],
      default: { orderBy: [["name", "asc"]], limit: 1 },
      maxLimit: 1,
    });
    expect(() =>
      // @ts-expect-error — "nope" is not sortable
      encode({ orderBy: [["nope", "asc"]] }),
    ).toThrow(/not a sortable column/);
    // @ts-expect-error — enabled takes a boolean
    expect(() => encode({ where: { enabled: "yes" } })).toThrow();
    // @ts-expect-error — exactly one operator
    expect(() => encode({ where: { count: { gt: 1, lt: 5 } } })).toThrow(
      /exactly one operator/,
    );
  });
});

describe("encode", () => {
  it("default query is byte-identical { limit: '100' }", () => {
    expect(encode()).toEqual({ limit: "100" });
    expect(encode({})).toEqual({ limit: "100" });
    expect(JSON.stringify(encode())).toBe('{"limit":"100"}');
  });

  it("explicit defaults encode to the same bytes", () => {
    const explicit = encode({
      where: {},
      orderBy: [["createdAt", "desc"]],
      limit: 100,
    });
    expect(JSON.stringify(explicit)).toBe(JSON.stringify(encode()));
  });

  it("canonicalizes key order, in lists and { eq }", () => {
    const a = encode({
      where: {
        status: { in: ["running", "error", "running"] },
        enabled: { eq: true },
      },
    });
    const b = encode({
      where: { enabled: true, status: { in: ["error", "running"] } },
    });
    expect(a).toEqual(b);
    expect(a).toEqual({
      limit: "100",
      where: '{"enabled":true,"status":{"in":["error","running"]}}',
    });
  });

  it("sorts number lists numerically", () => {
    expect(encode({ where: { count: { notIn: [10, 2, 2, -1] } } }).where).toBe(
      '{"count":{"notIn":[-1,2,10]}}',
    );
  });

  it("drops undefined filters (an absent optional key)", () => {
    expect(encode({ where: { status: undefined, enabled: false } })).toEqual({
      limit: "100",
      where: '{"enabled":false}',
    });
  });

  it("emits order only when it differs from the default", () => {
    expect(encode({ orderBy: [["name", "asc"]], limit: 50 })).toEqual({
      limit: "50",
      order: '[["name","asc"]]',
    });
  });

  it("throws above maxLimit and on non-positive limits (never clamps)", () => {
    expect(() => encode({ limit: 501 })).toThrow(/exceeds maxLimit/);
    expect(() => encode({ limit: 0 })).toThrow(/positive integer/);
    expect(() => encode({ limit: 1.5 })).toThrow(/positive integer/);
  });

  it("rejects null operands, over-long lists and non-finite numbers", () => {
    // @ts-expect-error — operands are never null
    expect(() => encode({ where: { count: null } })).toThrow(/isNull/);
    expect(() =>
      encode({
        where: { count: { in: Array.from({ length: 101 }, (_, i) => i) } },
      }),
    ).toThrow(/exceeds 100/);
    expect(() => encode({ where: { count: { gt: Infinity } } })).toThrow(
      /finite/,
    );
  });
});

type Query = NonNullable<Parameters<typeof encode>[0]>;

function toQuery(decoded: ReturnType<typeof decode>): Query {
  return {
    limit: decoded.limit,
    orderBy: decoded.orderBy,
    where: Object.fromEntries(
      decoded.where.map((c) => [
        c.column,
        c.op === "eq" ? c.operand : { [c.op]: c.operand },
      ]),
    ) as Query["where"],
  };
}

describe("decode", () => {
  const roundTrip = [
    {},
    { limit: 20 },
    { where: { enabled: true } },
    {
      where: {
        status: { in: ["error", "running"] as const },
        count: { gte: 3 },
      },
    },
    { where: { count: { isNull: true } } },
    {
      where: { status: { ne: "idle" as const } },
      orderBy: [
        ["name", "asc"],
        ["createdAt", "desc"],
      ] as const,
      limit: 500,
    },
  ];

  it("decode(encode(q)) round-trips", () => {
    for (const q of roundTrip) {
      const params = encode(q);
      expect(encode(toQuery(decode(params)))).toEqual(params);
    }
  });

  it("fills defaults and folds eq", () => {
    expect(decode({ limit: "100", where: '{"enabled":true}' })).toEqual({
      limit: 100,
      where: [{ column: "enabled", op: "eq", operand: true }],
      orderBy: [["createdAt", "desc"]],
    });
  });

  it("rejects unknown columns, ops, operands and params", () => {
    expect(() => decode({ limit: "100", where: '{"name":"x"}' })).toThrow(
      /not a filterable column/,
    );
    expect(() =>
      decode({ limit: "100", where: '{"count":{"like":"x"}}' }),
    ).toThrow(/unknown operator/);
    expect(() =>
      decode({ limit: "100", where: '{"status":"paused"}' }),
    ).toThrow(/invalid operand/);
    expect(() => decode({ limit: "100", where: '{"count":{"in":5}}' })).toThrow(
      /takes a list/,
    );
    expect(() =>
      decode({ limit: "100", where: '{"count":{"isNull":1}}' }),
    ).toThrow(/takes a boolean/);
    expect(() => decode({ limit: "100", where: "not json" })).toThrow(
      /invalid JSON/,
    );
    expect(() => decode({ limit: "100", where: "[]" })).toThrow(/JSON object/);
    expect(() => decode({ limit: "100", cursor: "x" })).toThrow(
      /unknown param/,
    );
    expect(() => decode({ limit: "100", order: '[["id","asc"]]' })).toThrow(
      /not a sortable/,
    );
  });

  it("rejects limits above max or malformed", () => {
    expect(() => decode({ limit: "501" })).toThrow(/exceeds maxLimit/);
    expect(() => decode({ limit: "010" })).toThrow(/canonical/);
    expect(() => decode({})).toThrow(/canonical/);
  });

  it("rejects every non-canonical spelling", () => {
    const nonCanonical: Record<string, string>[] = [
      { limit: "100", where: "{}" },
      { limit: "100", where: '{"status":{"in":["running","error"]}}' },
      { limit: "100", where: '{"status":{"in":["error","error"]}}' },
      { limit: "100", where: '{"enabled":{"eq":true}}' },
      { limit: "100", where: '{"status":"idle","enabled":true}' },
      { limit: "100", where: '{ "enabled":true}' },
      { limit: "100", order: '[["createdAt","desc"]]' },
    ];
    for (const params of nonCanonical) {
      expect(() => decode(params)).toThrow(/not canonical/);
    }
  });
});
