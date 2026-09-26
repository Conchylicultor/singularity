/**
 * The value options `compileValue` folds into the runtime — `throttleMs`,
 * `recomputeOn`, `whileSubscribed`, `revalidate` — driven through a real
 * `createResourceRuntime` via `registerValue` (the one path both `serveValue`s
 * take), with a fake socket that subscribes and unsubscribes.
 */

import { describe, expect, test } from "bun:test";
import { z } from "zod";
import {
  createResourceRuntime,
  type ResourceParams,
} from "@plugins/framework/plugins/resource-runtime/core";
import { liveValue } from "@plugins/network/plugins/live/core";
import {
  compileValue,
  registerValue,
  type ServedValueBase,
  type StopFn,
} from "./compile-value";

const Count = z.object({ n: z.number() });
const Sha = z.object({ sha: z.string() });

let seq = 0;
const key = (name: string) => `test.compile-value.${name}.${seq++}`;

interface Frame {
  kind: string;
  key?: string;
  params?: ResourceParams;
  value?: unknown;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A runtime + one open socket recording every frame it is sent. */
function harness() {
  const runtime = createResourceRuntime();
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
      await sleep(5);
    }
    throw new Error(`timed out waiting for ${what}`);
  };
  const acks = (k: string, params: ResourceParams) =>
    frames.filter(
      (f) =>
        f.kind === "sub-ack" &&
        f.key === k &&
        JSON.stringify(f.params) === JSON.stringify(params),
    ).length;
  return {
    runtime,
    frames,
    until,
    async subscribe(k: string, params: ResourceParams = {}) {
      const before = acks(k, params);
      handler.message(ws, JSON.stringify({ op: "sub", key: k, params }));
      await until(() => acks(k, params) > before, `sub-ack ${k}`);
    },
    unsubscribe(k: string, params: ResourceParams = {}) {
      handler.message(ws, JSON.stringify({ op: "unsub", key: k, params }));
    },
    of: (kind: string, k: string) =>
      frames.filter((f) => f.kind === kind && f.key === k),
  };
}

/** An external upstream `{ refName }` value registered on `runtime`. */
function upstream(runtime: ReturnType<typeof createResourceRuntime>) {
  const v = liveValue(key("ref"), { schema: Sha, params: ["refName"] });
  const { resource } = registerValue(runtime, v, {
    source: "external",
    loader: () => ({ sha: "s" }),
  });
  const served = {
    ...resource,
    source: "external" as const,
    keys: [v.key],
  } as ServedValueBase<{ sha: string }, { refName: string }> & {
    notify(p?: { refName: string }): void;
  };
  return served;
}

describe("throttleMs", () => {
  test("a burst of notifies coalesces into one recompute", async () => {
    const h = harness();
    const v = liveValue(key("throttle"), { schema: Count });
    let loads = 0;
    const { resource } = registerValue(h.runtime, v, {
      source: "external",
      throttleMs: 40,
      loader: () => ({ n: ++loads }),
    });
    await h.subscribe(v.key);
    const afterSub = loads;
    const notify = (resource as { notify(): void }).notify;
    for (let i = 0; i < 5; i++) notify();
    await sleep(10);
    // Still inside the window: nothing flushed yet.
    expect(loads).toBe(afterSub);
    await h.until(() => h.of("update", v.key).length > 0, "update");
    await sleep(60);
    expect(loads).toBe(afterSub + 1);
    expect(h.of("update", v.key)).toHaveLength(1);
  });
});

describe("recomputeOn", () => {
  test("bare: every subscribed tuple recomputes, and no unsubscribed one", async () => {
    const h = harness();
    const ref = upstream(h.runtime);
    const v = liveValue(key("bare"), { schema: Count, params: ["id"] });
    const loaded: string[] = [];
    registerValue(h.runtime, v, {
      source: "external",
      recomputeOn: [ref],
      loader: ({ id }) => {
        loaded.push(id);
        return { n: loaded.length };
      },
    });
    await h.subscribe(v.key, { id: "a" });
    await h.subscribe(v.key, { id: "b" });
    await h.subscribe(v.key, { id: "c" });
    h.unsubscribe(v.key, { id: "c" });
    loaded.length = 0;

    ref.notify({ refName: "refs/heads/main" });
    await h.until(() => loaded.length >= 2, "downstream loads");
    await sleep(20);
    expect([...loaded].sort()).toEqual(["a", "b"]);
  });

  test("bare, on a param-less value: its one tuple recomputes", async () => {
    const h = harness();
    const ref = upstream(h.runtime);
    const v = liveValue(key("bare-paramless"), { schema: Count });
    let loads = 0;
    registerValue(h.runtime, v, {
      source: "external",
      recomputeOn: [ref],
      loader: () => ({ n: ++loads }),
    });
    await h.subscribe(v.key);
    ref.notify({ refName: "refs/heads/main" });
    await h.until(() => h.of("update", v.key).length > 0, "update");
    expect(h.of("update", v.key)[0]!.value).toEqual({ n: 2 });
  });

  test("mapped: only the tuple the upstream's params map to recomputes", async () => {
    const h = harness();
    const ref = upstream(h.runtime);
    const v = liveValue(key("mapped"), { schema: Count, params: ["branch"] });
    const loaded: string[] = [];
    registerValue(h.runtime, v, {
      source: "external",
      recomputeOn: [
        { value: ref, params: ({ refName }) => ({ branch: refName }) },
      ],
      loader: ({ branch }) => {
        loaded.push(branch);
        return { n: loaded.length };
      },
    });
    await h.subscribe(v.key, { branch: "main" });
    await h.subscribe(v.key, { branch: "other" });
    loaded.length = 0;

    ref.notify({ refName: "main" });
    await h.until(() => loaded.length >= 1, "downstream load");
    await sleep(20);
    expect(loaded).toEqual(["main"]);
  });

  test("types: a mapped entry sees its upstream's params and returns this value's", () => {
    const runtime = createResourceRuntime();
    const ref = upstream(runtime);
    const v = liveValue(key("t-mapped"), { schema: Count, params: ["id"] });
    // Never called — the assertions are the `@ts-expect-error`s.
    const typeOnly = () => {
      compileValue(v, {
        source: "external",
        loader: () => ({ n: 0 }),
        recomputeOn: [
          // @ts-expect-error — the upstream has `refName`, not `id`
          { value: ref, params: ({ id }) => ({ id }) },
        ],
      });
      compileValue(v, {
        source: "external",
        loader: () => ({ n: 0 }),
        recomputeOn: [
          // @ts-expect-error — must return THIS value's params
          { value: ref, params: ({ refName }) => ({ branch: refName }) },
        ],
      });
    };
    expect(typeof typeOnly).toBe("function");
  });
});

describe("whileSubscribed", () => {
  test("starts once per first subscriber, stops once per last unsubscribe", async () => {
    const h = harness();
    const v = liveValue(key("lifecycle"), { schema: Count, params: ["id"] });
    const log: string[] = [];
    registerValue(h.runtime, v, {
      source: "db",
      loader: () => ({ n: 1 }),
      whileSubscribed: ({ id }): StopFn => {
        log.push(`start ${id}`);
        return () => log.push(`stop ${id}`);
      },
    });
    // A second socket holding the same tuple keeps it subscribed.
    const other = {
      send() {},
    };
    const handler = h.runtime.notificationsWsHandler as any;
    handler.open(other);
    await h.subscribe(v.key, { id: "a" });
    handler.message(
      other,
      JSON.stringify({ op: "sub", key: v.key, params: { id: "a" } }),
    );
    await sleep(10);
    expect(log).toEqual(["start a"]);
    h.unsubscribe(v.key, { id: "a" });
    expect(log).toEqual(["start a"]);
    handler.message(
      other,
      JSON.stringify({ op: "unsub", key: v.key, params: { id: "a" } }),
    );
    expect(log).toEqual(["start a", "stop a"]);
  });

  test("external: notify recomputes the tuple it was handed", async () => {
    const h = harness();
    const v = liveValue(key("watch"), { schema: Count, params: ["id"] });
    let fire: (() => void) | undefined;
    let n = 1;
    registerValue(h.runtime, v, {
      source: "external",
      loader: () => ({ n }),
      whileSubscribed: (_params, notify) => {
        fire = notify;
        return () => {};
      },
    });
    await h.subscribe(v.key, { id: "a" });
    n = 7;
    fire!();
    await h.until(() => h.of("update", v.key).length > 0, "update");
    expect(h.of("update", v.key)[0]).toMatchObject({
      params: { id: "a" },
      value: { n: 7 },
    });
  });

  test("a stop that arrives before an async start resolves runs after it", async () => {
    const h = harness();
    const v = liveValue(key("async"), { schema: Count, params: ["id"] });
    const log: string[] = [];
    let resolveStart: ((stop: StopFn) => void) | undefined;
    const compiled = compileValue(v, {
      source: "external",
      loader: () => ({ n: 1 }),
      whileSubscribed: ({ id }) =>
        new Promise<StopFn>((resolve) => {
          log.push(`start ${id}`);
          resolveStart = resolve;
        }),
    });
    compiled.bindNotify(() => {});
    // Drive the paired hooks directly: the runtime awaits the start on the
    // subscribe path, so a real unsubscribe cannot overtake it through a socket.
    const started = compiled.options.onFirstSubscribe!({ id: "a" });
    compiled.options.onLastUnsubscribe!({ id: "a" });
    expect(log).toEqual(["start a"]);
    resolveStart!(() => log.push("stop a"));
    await started;
    await sleep(0);
    expect(log).toEqual(["start a", "stop a"]);
    expect(h.frames).toEqual([]);
  });

  test("a start that failed has nothing to stop, and its rejection reaches the runtime", async () => {
    const v = liveValue(key("fail"), { schema: Count, params: ["id"] });
    const compiled = compileValue(v, {
      source: "db",
      loader: () => ({ n: 1 }),
      whileSubscribed: () => Promise.reject(new Error("no worktree")),
    });
    const started = compiled.options.onFirstSubscribe!({ id: "a" });
    compiled.options.onLastUnsubscribe!({ id: "a" });
    expect(started).rejects.toThrow("no worktree");
    await sleep(0);
  });

  test("types: the db arm is handed no notify", () => {
    const v = liveValue(key("t-db"), { schema: Count, params: ["id"] });
    // Never called — the assertion is the `@ts-expect-error`.
    const typeOnly = () =>
      compileValue(v, {
        source: "db",
        loader: () => ({ n: 0 }),
        // @ts-expect-error — a db value is driven by the change feed alone
        whileSubscribed: (_p: { id: string }, notify: () => void) => notify,
      });
    expect(typeof typeOnly).toBe("function");
  });
});

describe("revalidate", () => {
  test("is passed through to the runtime", () => {
    const v = liveValue(key("reval"), { schema: Count });
    const revalidate = () => Promise.resolve("etag");
    const compiled = compileValue(v, {
      source: "external",
      loader: () => ({ n: 0 }),
      revalidate,
    });
    expect(compiled.options.revalidate).toBe(revalidate);
  });
});
