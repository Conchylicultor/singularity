import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { resourceDescriptorByKey } from "@plugins/primitives/plugins/live-state/core";
import { liveValue } from "./live-value";

const S = z.object({ n: z.number() });

describe("liveValue", () => {
  test("a param-less, un-preloaded value: no placeholder, no preload, no defaultParams", () => {
    const v = liveValue("test.live-value.plain", { schema: S });
    expect(v.live).toBe("value");
    expect(v.params).toEqual([]);
    expect("initialData" in v).toBe(false);
    expect(v.preload).toBeUndefined();
    expect(v.defaultParams).toBeUndefined();
    expect(v.keyed).toBeUndefined();
    // Registered, so boot hydration can resolve its key.
    expect(resourceDescriptorByKey("test.live-value.plain")).toBe(v);
  });

  test('"none" is the absence of a preload', () => {
    const v = liveValue("test.live-value.none", { schema: S, preload: "none" });
    expect(v.preload).toBeUndefined();
    expect(v.defaultParams).toBeUndefined();
  });

  test("a preloaded value carries the flag and the {} default tuple", () => {
    const boot = liveValue("test.live-value.boot", {
      schema: S,
      preload: "boot",
    });
    expect(boot.preload).toBe("boot");
    expect(boot.defaultParams).toEqual({});
    const keep = liveValue("test.live-value.keep", {
      schema: S,
      preload: "boot-and-keep",
    });
    expect(keep.preload).toBe("boot-and-keep");
    expect(keep.defaultParams).toEqual({});
  });

  test("params derive P and are recorded; a parameterized value has no default tuple", () => {
    const v = liveValue("test.live-value.params", {
      schema: S,
      params: ["id", "scope"],
    });
    expect(v.params).toEqual(["id", "scope"]);
    expect(v.defaultParams).toBeUndefined();
    const p: NonNullable<typeof v.__params> = { id: "a", scope: "b" };
    expect(p.id).toBe("a");
    // @ts-expect-error — `P` has exactly the declared names
    const bad: NonNullable<typeof v.__params> = { id: "a" };
    expect(bad).toBeDefined();
  });

  test('a trailing "?" declares an optional param: P marks it optional, the descriptor lists it', () => {
    const v = liveValue("test.live-value.optional", {
      schema: S,
      params: ["path", "scopeId?"],
    });
    expect(v.params).toEqual(["path", "scopeId"]);
    expect(v.optionalParams).toEqual(["scopeId"]);
    const base: NonNullable<typeof v.__params> = { path: "a" };
    const scoped: NonNullable<typeof v.__params> = { path: "a", scopeId: "s" };
    expect([base, scoped]).toHaveLength(2);
    // @ts-expect-error — the required name stays required
    const bad: NonNullable<typeof v.__params> = { scopeId: "s" };
    expect(bad).toBeDefined();
    // A value with no optional name carries no list.
    expect(
      liveValue("test.live-value.required-only", { schema: S, params: ["id"] })
        .optionalParams,
    ).toBeUndefined();
  });

  test("a bad param name throws (empty, inner ?, duplicate)", () => {
    for (const params of [["?"], ["a?b"], ["id", "id?"]] as const) {
      expect(() =>
        liveValue(`test.live-value.bad-${params.join("-")}`, {
          schema: S,
          params: params as unknown as readonly [string, ...string[]],
        }),
      ).toThrow(/bad param name/);
    }
  });

  test("a parameterized value may be preloaded: no default tuple, and it is branded preloadsParams", () => {
    const v = liveValue("test.live-value.param-preload", {
      schema: S,
      params: ["path", "scopeId?"],
      preload: "boot-and-keep",
    });
    expect(v.preload).toBe("boot-and-keep");
    expect(v.preloadsParams).toBe(true);
    expect(v.defaultParams).toBeUndefined();
    // A param-less preload is not branded (it has its `{}` default tuple).
    expect(
      "preloadsParams" in
        liveValue("test.live-value.boot-unbranded", {
          schema: S,
          preload: "boot",
        }),
    ).toBe(false);
  });

  test("a central value cannot be preloaded", () => {
    expect(() =>
      liveValue("test.live-value.central-preload", {
        schema: S,
        origin: "central",
        // `preload` is `never` on a central value (tsc) — an untyped caller here.
        preload: "boot" as never,
      }),
    ).toThrow(/central value cannot be preloaded/);
  });
});
