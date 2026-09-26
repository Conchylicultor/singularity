/**
 * `serveValue` / `compileValue`: the options a `liveValue` folds into, driven
 * through a real `createResourceRuntime` (no database — the db arm's change is
 * delivered through `applyDbChange`, exactly what the change feed calls), plus
 * the registering `serveValue` on the server runtime for the served shape and
 * its `Resource.Declare` payload.
 */

import { describe, expect, test } from "bun:test";
import { z } from "zod";
import {
  createResourceRuntime,
  type ResourceParams,
} from "@plugins/framework/plugins/resource-runtime/core";
import { liveValue } from "@plugins/network/plugins/live/core";
import { compileValue } from "../../shared/compile-value";
import { serveValue } from "./serve-value";

const Count = z.object({ n: z.number() });
const Names = z.array(z.string());

let seq = 0;
const key = (name: string) => `test.serve-value.${name}.${seq++}`;

interface Frame {
  kind: string;
  key?: string;
  params?: ResourceParams;
  value?: unknown;
}

/** A runtime + one open socket recording every frame it is sent. */
function harness(readSet: string[] = []) {
  const runtime = createResourceRuntime({ readSet: () => readSet });
  const frames: Frame[] = [];
  const handler = runtime.notificationsWsHandler as any;
  const ws = {
    send(raw: string) {
      const f = JSON.parse(raw) as Frame;
      if (f.kind !== "ping") frames.push(f);
    },
  };
  handler.open(ws);
  const until = async (pred: () => boolean, what: string) => {
    for (let i = 0; i < 200; i++) {
      if (pred()) return;
      await new Promise((r) => setTimeout(r, 5));
    }
    throw new Error(`timed out waiting for ${what}`);
  };
  return {
    runtime,
    frames,
    async subscribe(k: string, params: ResourceParams = {}) {
      handler.message(ws, JSON.stringify({ op: "sub", key: k, params }));
      await until(
        () => frames.some((f) => f.kind === "sub-ack" && f.key === k),
        `sub-ack ${k}`,
      );
    },
    of: (kind: string, k: string) =>
      frames.filter((f) => f.kind === kind && f.key === k),
    until,
  };
}

describe("compileValue", () => {
  test("the default load is push; `on-demand` maps to the runtime's invalidate", () => {
    const v = liveValue(key("modes"), { schema: Count });
    const loader = () => ({ n: 1 });
    expect(compileValue(v, { source: "db", loader }).options.mode).toBe("push");
    expect(
      compileValue(v, { source: "db", loader, load: "push" }).options.mode,
    ).toBe("push");
    expect(
      compileValue(v, { source: "db", loader, load: "on-demand" }).options.mode,
    ).toBe("invalidate");
  });

  test("a db value is recomputed and pushed when a table it read changes", async () => {
    const v = liveValue(key("db"), { schema: Count });
    let n = 1;
    const h = harness(["t"]);
    const compiled = compileValue(v, { source: "db", loader: () => ({ n }) });
    expect(compiled.external).toBe(false);
    h.runtime.defineResource(v, compiled.options);
    await h.subscribe(v.key);
    expect(h.of("sub-ack", v.key)[0]!.value).toEqual({ n: 1 });

    n = 2;
    h.runtime.applyDbChange({
      table: "t",
      op: "U",
      ids: ["x"],
      origin: "t",
      identityBase: "t",
    });
    await h.until(() => h.of("update", v.key).length > 0, "update");
    expect(h.of("update", v.key)[0]!.value).toEqual({ n: 2 });
  });

  test("an on-demand value ships an invalidate, never the value, on a change", async () => {
    const v = liveValue(key("on-demand"), { schema: Count });
    let n = 1;
    const h = harness(["t"]);
    h.runtime.defineResource(
      v,
      compileValue(v, {
        source: "db",
        loader: () => ({ n }),
        load: "on-demand",
      }).options,
    );
    await h.subscribe(v.key);
    n = 2;
    h.runtime.applyDbChange({
      table: "t",
      op: "U",
      ids: ["x"],
      origin: "t",
      identityBase: "t",
    });
    await h.until(() => h.of("invalidate", v.key).length > 0, "invalidate");
    expect(h.of("update", v.key)).toEqual([]);
  });

  test("an external value's notify pushes the new value", async () => {
    const v = liveValue(key("external"), { schema: Count, params: ["id"] });
    let n = 1;
    const h = harness();
    const compiled = compileValue(v, {
      source: "external",
      loader: ({ id }) => ({ n: id === "a" ? n : -1 }),
    });
    expect(compiled.external).toBe(true);
    const r = h.runtime.defineExternalResource(v, compiled.options);
    await h.subscribe(v.key, { id: "a" });
    n = 5;
    r.notify({ id: "a" });
    await h.until(() => h.of("update", v.key).length > 0, "update");
    expect(h.of("update", v.key)[0]!.value).toEqual({ n: 5 });
  });

  test("a collection-shaped db value records its reason; an empty one throws", () => {
    const v = liveValue(key("names"), { schema: Names });
    const compiled = compileValue(v, {
      source: "db",
      loader: () => [],
      unbounded: { reason: "one row per configured host" },
    });
    expect(compiled.unbounded).toEqual({
      reason: "one row per configured host",
    });
    expect(() =>
      compileValue(v, {
        source: "db",
        loader: () => [],
        unbounded: { reason: "  " },
      }),
    ).toThrow(/unbounded.reason` is empty/);
  });

  test("types: the bound rule and the params type", () => {
    const names = liveValue(key("t-names"), { schema: Names });
    const record = liveValue(key("t-record"), {
      schema: z.record(z.string(), z.number()),
    });
    const count = liveValue(key("t-count"), { schema: Count });
    const detail = liveValue(key("t-detail"), {
      schema: Count,
      params: ["id"],
    });
    // Never called — the assertions are the `@ts-expect-error`s.
    const typeOnly = () => {
      // @ts-expect-error — a db array must say why it is not a collection
      compileValue(names, { source: "db", loader: () => [] });
      // @ts-expect-error — so must a string-indexed record
      compileValue(record, { source: "db", loader: () => ({}) });
      compileValue(names, {
        source: "db",
        loader: () => [],
        unbounded: { reason: "r" },
      });
      // An in-memory array is bounded by the process that holds it.
      compileValue(names, { source: "external", loader: () => [] });
      compileValue(count, {
        source: "db",
        loader: () => ({ n: 0 }),
        // @ts-expect-error — `unbounded` only on a collection-shaped db value
        unbounded: { reason: "r" },
      });
      compileValue(names, {
        source: "external",
        loader: () => [],
        // @ts-expect-error — nor on an external one
        unbounded: { reason: "r" },
      });
      compileValue(detail, {
        source: "db",
        // @ts-expect-error — the loader's params are the declared names
        loader: (p: { other: string }) => ({ n: p.other.length }),
      });
    };
    expect(typeof typeOnly).toBe("function");
  });
});

describe("serveValue", () => {
  test("the db arm: push by default, one Declare carrying preload, keys, and no notify", () => {
    const v = liveValue(key("served-db"), { schema: Count, preload: "boot" });
    const served = serveValue(v, { source: "db", loader: () => ({ n: 1 }) });
    expect(served.key).toBe(v.key);
    expect(served.mode).toBe("push");
    expect(served.source).toBe("db");
    expect(served.preload).toBe("boot");
    expect(served.keys).toEqual([v.key]);
    expect(served.declare).toHaveLength(1);
    expect(served.declare[0]).toMatchObject({
      key: v.key,
      mode: "push",
      preload: "boot",
    });
    expect("notify" in served).toBe(false);
    // @ts-expect-error — a Postgres-backed value is driven by the change feed alone
    expect(served.notify).toBeUndefined();
  });

  test("types: a central value is not served here", () => {
    const central = liveValue(key("served-central"), {
      schema: Count,
      origin: "central",
    });
    expect(central.origin).toBe("central");
    // Never called — the assertion is the `@ts-expect-error`.
    const typeOnly = () =>
      // @ts-expect-error — a central value is served by network/live/central
      serveValue(central, { source: "external", loader: () => ({ n: 1 }) });
    expect(typeof typeOnly).toBe("function");
  });

  test("the external arm has notify; on-demand is served as invalidate", () => {
    const v = liveValue(key("served-ext"), { schema: Count });
    const served = serveValue(v, {
      source: "external",
      loader: () => ({ n: 1 }),
      load: "on-demand",
    });
    expect(served.mode).toBe("invalidate");
    expect(served.source).toBe("external");
    expect(typeof served.notify).toBe("function");
    expect(served.declare[0]).toMatchObject({ key: v.key, mode: "invalidate" });
    expect(served.declare[0]!.preload).toBeUndefined();
    served.notify();
  });
});
