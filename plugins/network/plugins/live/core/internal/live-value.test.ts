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
});
