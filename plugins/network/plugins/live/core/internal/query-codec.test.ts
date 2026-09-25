import { describe, expect, it } from "bun:test";
import { z } from "zod";
import type { WindowQueryResourceContract } from "@plugins/infra/plugins/query-resource/core";
import {
  and,
  decodeFilter,
  liveBoolean,
  liveText,
  matchesFilter,
  or,
} from "@plugins/network/plugins/live/plugins/filter/core";
import { liveCollection } from "./live-collection";

const RowSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.enum(["running", "error", "idle"]),
  enabled: z.boolean(),
  count: z.number().nullable(),
  createdAt: z.string(),
});
const Status = z.enum(["running", "error", "idle"]);
type Row = z.infer<typeof RowSchema>;

const sources = liveCollection("live-test.codec", {
  row: RowSchema,
  id: "id",
  filterable: {
    status: liveText(Status),
    enabled: liveBoolean(),
    name: liveText(),
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
  it("mints the window key and its :rows and :groups siblings", () => {
    expect(sources.window.key).toBe("live-test.codec");
    expect(sources.rows.key).toBe("live-test.codec:rows");
    expect(sources.groups.key).toBe("live-test.codec:groups");
    expect(sources.rowKeys).toEqual([
      "id",
      "name",
      "status",
      "enabled",
      "count",
      "createdAt",
    ]);
    expect(sources.window.defaultParams).toEqual({ limit: "100" });
    expect(sources.window.window.maxLimit).toBe(500);
    expect(_asContract.window.decode({ limit: "7" }).limit).toBe(7);
  });

  it("rejects undeclared columns, reserved names and domain mismatches at the type level", () => {
    liveCollection("live-test.bad-filter", {
      row: RowSchema,
      id: "id",
      // @ts-expect-error — "bogus" is not a row field
      filterable: { bogus: liveText() },
      sortable: ["name"],
      default: { orderBy: [["name", "asc"]], limit: 1 },
      maxLimit: 1,
    });
    liveCollection("live-test.bad-domain", {
      row: RowSchema,
      id: "id",
      // @ts-expect-error — `name` is a string field, not a boolean
      filterable: { name: liveBoolean() },
      sortable: ["name"],
      default: { orderBy: [["name", "asc"]], limit: 1 },
      maxLimit: 1,
    });
    const OrRow = z.object({ id: z.string(), or: z.string() });
    expect(() =>
      liveCollection("live-test.reserved", {
        row: OrRow,
        id: "id",
        // @ts-expect-error — "or" spells a filter tree, so it cannot be a filterable column
        filterable: { or: liveText() },
        sortable: [],
        default: { orderBy: [["id", "asc"]], limit: 1 },
        maxLimit: 1,
      }),
    ).toThrow(/cannot be a filterable column/);
    expect(() =>
      // @ts-expect-error — "nope" is not sortable
      encode({ orderBy: [["nope", "asc"]] }),
    ).toThrow(/not a sortable column/);
    // @ts-expect-error — enabled takes a boolean
    expect(() => encode({ where: { enabled: "yes" } })).toThrow();
    // @ts-expect-error — exactly one operator
    expect(() => encode({ where: { name: { gt: "a", lt: "b" } } })).toThrow(
      /exactly one operator/,
    );
    // @ts-expect-error — a boolean column takes no range op
    expect(() => encode({ where: { enabled: { gt: true } } })).toThrow(
      /does not take a boolean column/,
    );
    // @ts-expect-error — status operands are narrowed to its enum in tsc
    expect(encode({ where: { status: "paused" } }).where).toBeDefined();
    expect(() =>
      encode({
        // @ts-expect-error — a tree clause is checked against the declaration too
        where: or({ column: "enabled", op: "eq", operand: "x" }),
      }),
    ).toThrow();
  });
});

describe("encode", () => {
  it("default query is byte-identical { limit: '100' }", () => {
    expect(encode()).toEqual({ limit: "100" });
    expect(encode({})).toEqual({ limit: "100" });
    expect(JSON.stringify(encode())).toBe('{"limit":"100"}');
  });

  it("explicit defaults — and an empty and() — encode to the same bytes", () => {
    const explicit = encode({
      where: {},
      orderBy: [["createdAt", "desc"]],
      limit: 100,
    });
    expect(JSON.stringify(explicit)).toBe(JSON.stringify(encode()));
    expect(encode({ where: and() })).toEqual({ limit: "100" });
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
      where:
        '{"and":[{"column":"enabled","op":"eq","operand":true},' +
        '{"column":"status","op":"in","operand":["error","running"]}]}',
    });
  });

  it("the object sugar and the equivalent tree encode to the same bytes", () => {
    const sugar = encode({
      where: { enabled: true, status: { in: ["error", "running"] } },
    });
    const tree = encode({
      where: and(
        { column: "status", op: "in", operand: ["running", "error"] },
        and({ column: "enabled", op: "eq", operand: true }),
      ),
    });
    expect(tree).toEqual(sugar);
  });

  it("an or tree encodes canonically", () => {
    const a = encode({
      where: or(
        { column: "status", op: "eq", operand: "error" },
        and(
          { column: "enabled", op: "eq", operand: false },
          { column: "name", op: "gte", operand: "m" },
        ),
      ),
    });
    const b = encode({
      where: or(
        and(
          { column: "name", op: "gte", operand: "m" },
          { column: "enabled", op: "eq", operand: false },
        ),
        { column: "status", op: "eq", operand: "error" },
      ),
    });
    expect(a).toEqual(b);
    expect(a.where).toBe(
      '{"or":[{"and":[{"column":"enabled","op":"eq","operand":false},' +
        '{"column":"name","op":"gte","operand":"m"}]},' +
        '{"column":"status","op":"eq","operand":"error"}]}',
    );
  });

  it("sorts and dedupes lists", () => {
    expect(
      encode({ where: { name: { notIn: ["b", "a", "b", "A"] } } }).where,
    ).toBe('{"column":"name","op":"notIn","operand":["A","a","b"]}');
  });

  it("spells a no-operand op { op: true }", () => {
    expect(encode({ where: { name: { isEmpty: true } } }).where).toBe(
      '{"column":"name","op":"isEmpty"}',
    );
    expect(() =>
      // @ts-expect-error — only `true` spells a no-operand op
      encode({ where: { name: { isEmpty: false } } }),
    ).toThrow(/isEmpty: true/);
  });

  it("drops undefined filters (an absent optional key)", () => {
    expect(encode({ where: { status: undefined, enabled: false } })).toEqual({
      limit: "100",
      where: '{"column":"enabled","op":"eq","operand":false}',
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

  it("rejects null operands and over-long lists", () => {
    // @ts-expect-error — operands are never null
    expect(() => encode({ where: { name: null } })).toThrow(/isEmpty/);
    expect(() =>
      encode({
        where: {
          name: { in: Array.from({ length: 101 }, (_, i) => `n${i}`) },
        },
      }),
    ).toThrow(/exceeds 100/);
  });
});

type Query = NonNullable<Parameters<typeof encode>[0]>;

describe("decode", () => {
  const roundTrip: Query[] = [
    {},
    { limit: 20 },
    { where: { enabled: true } },
    {
      where: {
        status: { in: ["error", "running"] },
        name: { gte: "m" },
      },
    },
    { where: { name: { isEmpty: true } } },
    {
      where: or(
        { column: "enabled", op: "eq", operand: true },
        { column: "name", op: "contains", operand: "x" },
      ),
    },
    {
      where: { status: { ne: "idle" } },
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
      const decoded = decode(params);
      expect(
        encode({
          limit: decoded.limit,
          orderBy: decoded.orderBy,
          where: decoded.where as Query["where"],
        }),
      ).toEqual(params);
    }
  });

  it("fills defaults and yields the canonical tree", () => {
    expect(
      decode({
        limit: "100",
        where: '{"column":"enabled","op":"eq","operand":true}',
      }),
    ).toEqual({
      limit: 100,
      where: { column: "enabled", op: "eq", operand: true },
      orderBy: [["createdAt", "desc"]],
    });
    expect(decode({ limit: "100" }).where).toBeUndefined();
  });

  it("rejects unknown columns, ops, operands and params", () => {
    const w = (where: string) => ({ limit: "100", where });
    expect(() => decode(w('{"column":"id","op":"eq","operand":"x"}'))).toThrow(
      /not a filterable column/,
    );
    expect(() =>
      decode(w('{"column":"name","op":"like","operand":"x"}')),
    ).toThrow(/unknown op/);
    expect(() =>
      decode(w('{"column":"enabled","op":"gt","operand":true}')),
    ).toThrow(/does not take a boolean column/);
    expect(() =>
      decode(w('{"column":"name","op":"in","operand":"x"}')),
    ).toThrow(/takes a list/);
    expect(() =>
      decode(w('{"column":"name","op":"isEmpty","operand":1}')),
    ).toThrow(/takes no operand/);
    expect(() => decode(w("not json"))).toThrow(/invalid JSON/);
    expect(() => decode(w("[]"))).toThrow(/and\/or group/);
    expect(() => decode({ limit: "100", cursor: "x" })).toThrow(
      /unknown param/,
    );
    expect(() => decode({ limit: "100", order: '[["id","asc"]]' })).toThrow(
      /not a sortable/,
    );
  });

  it("a stale enum operand decodes (checked against the domain) and matches nothing", () => {
    const params = {
      limit: "100",
      where: '{"column":"status","op":"eq","operand":"paused"}',
    };
    const { where } = decode(params);
    expect(where).toEqual({ column: "status", op: "eq", operand: "paused" });
    const row = {
      id: "a",
      name: "a",
      status: "running",
      enabled: true,
      count: 1,
      createdAt: "2026-09-01T00:00:00.000Z",
    };
    for (const status of Status.options) {
      expect(
        matchesFilter({ ...row, status }, where!, sources.filterable),
      ).toBe(false);
    }
  });

  it("rejects limits above max or malformed", () => {
    expect(() => decode({ limit: "501" })).toThrow(/exceeds maxLimit/);
    expect(() => decode({ limit: "010" })).toThrow(/canonical/);
    expect(() => decode({})).toThrow(/canonical/);
  });

  it("rejects every non-canonical spelling", () => {
    const nonCanonical: Record<string, string>[] = [
      // an unsorted / duplicated list
      {
        limit: "100",
        where: '{"column":"status","op":"in","operand":["running","error"]}',
      },
      {
        limit: "100",
        where: '{"column":"status","op":"in","operand":["error","error"]}',
      },
      // a singleton group
      {
        limit: "100",
        where: '{"and":[{"column":"enabled","op":"eq","operand":true}]}',
      },
      // unsorted children
      {
        limit: "100",
        where:
          '{"and":[{"column":"status","op":"eq","operand":"idle"},{"column":"enabled","op":"eq","operand":true}]}',
      },
      // key order / whitespace
      {
        limit: "100",
        where: '{"op":"eq","column":"enabled","operand":true}',
      },
      {
        limit: "100",
        where: '{ "column":"enabled","op":"eq","operand":true}',
      },
      { limit: "100", order: '[["createdAt","desc"]]' },
    ];
    for (const params of nonCanonical) {
      expect(() => decode(params)).toThrow(/canonical/);
    }
    // The absent filter has no encoding — its param is omitted.
    expect(() => decode({ limit: "100", where: '{"and":[]}' })).toThrow(
      /absent filter/,
    );
  });

  it("decode's filter is exactly the filter language's strict decode", () => {
    const json = encode({
      where: or(
        { column: "enabled", op: "eq", operand: true },
        { column: "name", op: "lt", operand: "m" },
      ),
    }).where!;
    expect(decode({ limit: "100", where: json }).where).toEqual(
      decodeFilter(json, sources.filterable),
    );
  });
});

describe("preload", () => {
  const spec = {
    row: RowSchema,
    id: "id",
    filterable: { enabled: liveBoolean() },
    sortable: ["name"],
    default: { orderBy: [["name", "asc"]], limit: 10 },
    maxLimit: 10,
  } as const;

  it("is off by default", () => {
    const c = liveCollection("live-test.preload-none", spec);
    expect(c.window.bootCritical).toBeUndefined();
  });

  it('"boot" marks the window only — never :rows or :groups', () => {
    const c = liveCollection("live-test.preload-boot", {
      ...spec,
      preload: "boot",
    });
    expect(c.window.bootCritical).toBe(true);
    expect(c.window.defaultParams).toEqual({ limit: "10" });
    expect(c.rows.bootCritical).toBeUndefined();
    expect(c.groups.bootCritical).toBeUndefined();
  });
});

describe("groups codec", () => {
  const groups = sources.groups.groups;

  it("encodes groupBy + the default limit, where only when non-empty", () => {
    expect(groups.defaultLimit).toBe(50);
    expect(groups.maxLimit).toBe(100);
    expect(groups.encode({ groupBy: "status" })).toEqual({
      groupBy: "status",
      limit: "50",
    });
    expect(groups.encode({ groupBy: "status", where: {} })).toEqual({
      groupBy: "status",
      limit: "50",
    });
  });

  it("canonicalises where exactly as a window does", () => {
    const a = groups.encode({
      groupBy: "status",
      where: { enabled: { eq: true }, name: { in: ["b", "a", "b"] } },
      limit: 20,
    });
    const b = groups.encode({
      groupBy: "status",
      where: or(
        and(
          { column: "name", op: "in", operand: ["a", "b"] },
          { column: "enabled", op: "eq", operand: true },
        ),
      ),
      limit: 20,
    });
    expect(a).toEqual(b);
    expect(a).toEqual({
      groupBy: "status",
      limit: "20",
      where:
        '{"and":[{"column":"enabled","op":"eq","operand":true},' +
        '{"column":"name","op":"in","operand":["a","b"]}]}',
    });
    expect(a.where).toBe(
      encode({ where: { enabled: true, name: { in: ["a", "b"] } } }).where,
    );
  });

  it("round-trips through a strict decode", () => {
    const params = groups.encode({
      groupBy: "enabled",
      where: { status: { ne: "idle" } },
    });
    expect(groups.decode(params)).toEqual({
      groupBy: "enabled",
      limit: 50,
      where: { column: "status", op: "ne", operand: "idle" },
    });
  });

  it("throws on an undeclared or ungroupable column, a limit above max, and an orderBy", () => {
    // @ts-expect-error — "id" is not filterable, so it cannot be grouped on
    expect(() => groups.encode({ groupBy: "id" })).toThrow(
      /not a filterable column/,
    );
    expect(() => groups.encode({ groupBy: "status", limit: 101 })).toThrow(
      /exceeds 100/,
    );
    expect(() => groups.encode({ groupBy: "status", limit: 0 })).toThrow(
      /positive integer/,
    );
    expect(() =>
      groups.encode({
        groupBy: "status",
        // @ts-expect-error — a grouping has a fixed order
        orderBy: [["name", "asc"]],
      }),
    ).toThrow(/fixed order/);
  });

  it("decode rejects undeclared columns, bad limits, unknown params and non-canonical spellings", () => {
    expect(() => groups.decode({ groupBy: "id", limit: "50" })).toThrow(
      /not a filterable column/,
    );
    expect(() => groups.decode({ groupBy: "status", limit: "101" })).toThrow(
      /exceeds 100/,
    );
    expect(() => groups.decode({ groupBy: "status", limit: "050" })).toThrow(
      /canonical/,
    );
    expect(() => groups.decode({ groupBy: "status" })).toThrow(/canonical/);
    expect(() =>
      groups.decode({
        groupBy: "status",
        limit: "50",
        order: '[["name","asc"]]',
      }),
    ).toThrow(/unknown param "order"/);
    expect(() =>
      groups.decode({ groupBy: "status", limit: "50", where: '{"and":[]}' }),
    ).toThrow(/absent filter/);
    expect(() =>
      groups.decode({
        groupBy: "status",
        limit: "50",
        where: '{"and":[{"column":"enabled","op":"eq","operand":true}]}',
      }),
    ).toThrow(/not canonical/);
  });
});
