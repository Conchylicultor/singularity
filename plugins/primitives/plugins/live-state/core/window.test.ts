/**
 * Window / point selector codecs — paramsKey identity is the load-bearing
 * property: the SAME logical selector must always produce the SAME params
 * object (boot hydration, the useResource subscription, and the server loader
 * must land on one per-tuple state), so encode is canonical and decode is
 * strict. Run: `bun test plugins/primitives/plugins/live-state/core/window.test.ts`.
 */

import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { pointResourceDescriptor, windowResourceDescriptor } from "./window";
import { resourceDescriptorByKey } from "./resource";

const el = z.object({ id: z.string() });
const keyOf = (r: unknown) => (r as { id: string }).id;

describe("windowResourceDescriptor", () => {
  const win = windowResourceDescriptor("test.window.codec", el, keyOf, {
    defaultLimit: 100,
    bootCritical: true,
  });

  test("registers a keyed z.array descriptor with the boot flag and defaultParams", () => {
    expect(resourceDescriptorByKey("test.window.codec")).toBe(win);
    expect(win.keyed.keyOf({ id: "a" })).toBe("a");
    expect(win.bootCritical).toBe(true);
    expect(win.initialData).toEqual([]);
    expect(win.schema.parse([{ id: "a" }])).toEqual([{ id: "a" }]);
  });

  test("defaultParams IS the canonical default-window encoding (one tuple for boot + hook + server)", () => {
    expect(win.defaultParams).toEqual({ limit: "100" });
    expect(win.window.encode()).toEqual(win.defaultParams);
    expect(win.window.encode({})).toEqual(win.defaultParams);
    expect(win.window.encode({ limit: 100 })).toEqual(win.defaultParams);
  });

  test("encode/decode round-trip", () => {
    const params = win.window.encode({ limit: 25 });
    expect(params).toEqual({ limit: "25" });
    expect(win.window.decode(params)).toEqual({ limit: 25 });
  });

  test("encode throws on a non-canonical limit (fail loudly, never a silent default)", () => {
    expect(() => win.window.encode({ limit: 0 })).toThrow(/positive integer/);
    expect(() => win.window.encode({ limit: -5 })).toThrow(/positive integer/);
    expect(() => win.window.encode({ limit: 2.5 })).toThrow(/positive integer/);
    expect(() => win.window.encode({ limit: Number.NaN })).toThrow(/positive integer/);
  });

  test("decode is STRICT: missing or malformed limit throws (`{}` must never alias the default window)", () => {
    expect(() => win.window.decode({})).toThrow(/params\.limit/);
    expect(() => win.window.decode({ limit: "abc" })).toThrow(/params\.limit/);
    expect(() => win.window.decode({ limit: "007" })).toThrow(/params\.limit/);
    expect(() => win.window.decode({ limit: "-1" })).toThrow(/params\.limit/);
    expect(() => win.window.decode({ limit: "1e3" })).toThrow(/params\.limit/);
  });

  test("factory rejects an invalid defaultLimit at declaration", () => {
    expect(() =>
      windowResourceDescriptor("test.window.codec-bad", el, keyOf, { defaultLimit: 0 }),
    ).toThrow(/positive integer/);
  });
});

describe("pointResourceDescriptor", () => {
  const pt = pointResourceDescriptor("test.point.codec", el, keyOf);

  test("registers a keyed descriptor with no defaultParams (point resources are never boot-critical)", () => {
    expect(resourceDescriptorByKey("test.point.codec")).toBe(pt);
    expect(pt.defaultParams).toBeUndefined();
    expect(pt.bootCritical).toBeUndefined();
  });

  test("encode canonicalizes: sorted, deduped, comma-joined", () => {
    expect(pt.point.encode(["b", "a", "a", "c"])).toEqual({ ids: "a,b,c" });
    expect(pt.point.encode(["x"])).toEqual({ ids: "x" });
    expect(pt.point.encode([])).toEqual({ ids: "" });
  });

  test("decode is the pure inverse (the server membership idsOf)", () => {
    expect(pt.point.decode({ ids: "a,b,c" })).toEqual(["a", "b", "c"]);
    expect(pt.point.decode({ ids: "" })).toEqual([]);
    expect(pt.point.decode(pt.point.encode(["z", "y"]))).toEqual(["y", "z"]);
  });

  test("encode throws on ids the joiner cannot represent", () => {
    expect(() => pt.point.encode([""])).toThrow(/non-empty/);
    expect(() => pt.point.encode(["a,b"])).toThrow(/comma-free/);
  });

  test("decode throws on a params tuple with no id set", () => {
    expect(() => pt.point.decode({})).toThrow(/params\.ids is missing/);
  });
});
