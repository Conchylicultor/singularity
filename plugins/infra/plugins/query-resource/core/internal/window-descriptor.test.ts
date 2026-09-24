/**
 * Window / point selector codecs — paramsKey identity is the load-bearing
 * property: the SAME logical selector must always produce the SAME params
 * object (boot hydration, the useResource subscription, and the server loader
 * must land on one per-tuple state), so encode is canonical and decode is
 * strict.
 */

import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { resourceDescriptorByKey } from "@plugins/primitives/plugins/live-state/core";
import {
  pointQueryResourceDescriptor,
  windowQueryResourceDescriptor,
} from "./window-descriptor";

const el = z.object({ id: z.string() });

describe("windowQueryResourceDescriptor", () => {
  const win = windowQueryResourceDescriptor("test.window.codec", el, "id", {
    defaultLimit: 100,
    bootCritical: true,
  });

  test("registers a keyed z.array descriptor with the boot flag and defaultParams", () => {
    expect(resourceDescriptorByKey("test.window.codec")).toBe(win);
    expect(win.keyed.keyOf({ id: "a" })).toBe("a");
    expect(win.queryPk).toBe("id");
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
    expect(() => win.window.encode({ limit: Number.NaN })).toThrow(
      /positive integer/,
    );
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
      windowQueryResourceDescriptor("test.window.codec-bad", el, "id", {
        defaultLimit: 0,
      }),
    ).toThrow(/positive integer/);
  });
});

describe("pointQueryResourceDescriptor", () => {
  const pt = pointQueryResourceDescriptor("test.point.codec", el, "id");

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
