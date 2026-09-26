import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { resourceDescriptorByKey } from "@plugins/primitives/plugins/live-state/core";
import { liveCollection } from "./live-collection";

const Row = z.object({ id: z.string(), n: z.number() });

describe("liveCollection — lookup-only (no default window)", () => {
  test("mints only the :rows point descriptor: no window, no groups, nothing else registered", () => {
    const c = liveCollection("test.live-collection.lookup", {
      row: Row,
      id: "id",
    });
    expect(c.rows.key).toBe("test.live-collection.lookup:rows");
    expect(c.window).toBeUndefined();
    expect(c.groups).toBeUndefined();
    expect(c.rowKeys).toEqual(["id", "n"]);
    expect(resourceDescriptorByKey("test.live-collection.lookup:rows")).toBe(
      c.rows,
    );
    expect(resourceDescriptorByKey("test.live-collection.lookup")).toBe(
      undefined,
    );
    expect(resourceDescriptorByKey("test.live-collection.lookup:groups")).toBe(
      undefined,
    );
    // The point codec is the full collection's: one id encodes to itself.
    expect(c.rows.point.encode(["b", "a"])).toEqual({ ids: "a,b" });
  });

  test("a full collection still mints all three", () => {
    const c = liveCollection("test.live-collection.full", {
      row: Row,
      id: "id",
      filterable: {},
      sortable: ["n"],
      default: { orderBy: [["n", "asc"]], limit: 10 },
      maxLimit: 50,
    });
    expect(resourceDescriptorByKey("test.live-collection.full")).toBe(c.window);
    expect(resourceDescriptorByKey("test.live-collection.full:rows")).toBe(
      c.rows,
    );
    expect(resourceDescriptorByKey("test.live-collection.full:groups")).toBe(
      c.groups,
    );
  });

  test("types: a window field without `default`, and any preload, are tsc errors", () => {
    // Never called — the assertions are the `@ts-expect-error`s.
    const _typesOnly = () => {
      // @ts-expect-error — an id set has no default tuple to preload
      liveCollection("test.types.a", { row: Row, id: "id", preload: "boot" });
      // @ts-expect-error — no order to sort without a default window
      liveCollection("test.types.b", { row: Row, id: "id", sortable: ["n"] });
      // @ts-expect-error — no list read would ever read a filter declaration
      liveCollection("test.types.c", { row: Row, id: "id", filterable: {} });
    };
    void _typesOnly;
  });

  test("an untyped half-window declaration throws instead of minting a lookup", () => {
    expect(() =>
      liveCollection("test.live-collection.half", {
        row: Row,
        id: "id",
        maxLimit: 10,
      } as never),
    ).toThrow(/maxLimit without `default`/);
  });
});
