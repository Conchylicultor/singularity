/**
 * Tests for the level-parallel `flushNotifies` in the resource runtime. Run with
 * `bun test plugins/framework/plugins/resource-runtime/core/runtime.test.ts`.
 *
 * The flush walks the dependsOn DAG grouped by longest-path depth: entries at the
 * same depth run concurrently (Promise.all), with a barrier between depths. These
 * tests pin the behaviors that fix the head-of-line-blocking bug:
 *
 *   - DECOUPLING: a slow loader at one node does NOT delay an unrelated node's
 *     frame at the same depth — the fast frame is sent before the slow loader
 *     resolves.
 *   - CASCADE ORDERING: a downstream's frame is sent strictly after its upstream's
 *     (the depth barrier preserves "cascade settles before the deeper level drains").
 *   - VERSION MONOTONICITY: per (key,pk) the version advances by one per notify.
 *   - REENTRANCY: a notify that lands while a flush is mid-await is re-drained by
 *     the single-active-flush guard — delivered, exactly once, AFTER the in-flight
 *     flush's frames (the guard serializes; it never overlaps two flushes).
 */

import { test, expect, describe } from "bun:test";
import { z } from "zod";
import { createResourceRuntime, type ResourceParams } from "./runtime";

// Next-macrotask yield: flushes all pending microtasks (the queued flush) AND any
// loader promises so the WS sends have landed in the log before we assert.
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

interface SentFrame {
  seq: number;
  key: string;
  kind: string;
  version?: number;
}

/** A runtime under test plus a single fake socket that records every frame sent. */
function harness() {
  const runtime = createResourceRuntime();
  const frames: SentFrame[] = [];
  let seq = 0;
  // Fake ServerWebSocket: only `send` is exercised by the runtime's sendJson.
  const ws = {
    send(raw: string) {
      const msg = JSON.parse(raw) as { kind: string; key?: string; version?: number };
      if (msg.kind === "ping") return; // ignore heartbeats
      frames.push({ seq: seq++, key: msg.key ?? "", kind: msg.kind, version: msg.version });
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handler = runtime.notificationsWsHandler as any;
  handler.open(ws);

  return {
    runtime,
    frames,
    async subscribe(key: string, params: ResourceParams = {}) {
      handler.message(ws, JSON.stringify({ op: "sub", key, params }));
      await tick(); // let the async sub-ack (initial load) complete
    },
    /** Frames for `key`, excluding the initial sub-ack, in send order. */
    pushesFor(key: string) {
      return frames.filter((f) => f.key === key && f.kind !== "sub-ack");
    },
  };
}

/**
 * A loader whose completion the test controls. Initially open (so the sub-ack's
 * initial load resolves immediately); call `block()` to make the NEXT load park
 * until `release()`.
 */
function controllable<T>(initial: T) {
  let releaseFn: (() => void) | undefined;
  let blocker: Promise<void> = Promise.resolve();
  let value = initial;
  return {
    loader: async (): Promise<T> => {
      await blocker;
      return value;
    },
    block() {
      blocker = new Promise<void>((res) => {
        releaseFn = res;
      });
    },
    release() {
      releaseFn?.();
    },
    setValue(v: T) {
      value = v;
    },
  };
}

describe("flushNotifies — level-parallel", () => {
  test("a slow loader does not head-of-line-block an unrelated fast node", async () => {
    const h = harness();
    const slow = controllable(0);
    const fast = controllable(0);

    const slowR = h.runtime.defineResource({
      key: "slow",
      mode: "push",
      schema: z.number(),
      loader: slow.loader,
    });
    const fastR = h.runtime.defineResource({
      key: "fast",
      mode: "push",
      schema: z.number(),
      loader: fast.loader,
    });

    await h.subscribe("slow");
    await h.subscribe("fast");

    // Arm the slow loader to park on its next load, then notify BOTH in the same
    // flush. `slow` and `fast` are both roots (depth 0) → same level → concurrent.
    slow.block();
    slow.setValue(1);
    fast.setValue(1);
    slowR.notify();
    fastR.notify();

    await tick();
    // Fast frame delivered while the slow loader is still parked — decoupled.
    expect(h.pushesFor("fast")).toHaveLength(1);
    expect(h.pushesFor("slow")).toHaveLength(0);

    slow.release();
    await tick();
    expect(h.pushesFor("slow")).toHaveLength(1);
  });

  test("a downstream frame is sent strictly after its upstream", async () => {
    const h = harness();
    const upstreamR = h.runtime.defineResource({
      key: "up",
      mode: "push",
      schema: z.number(),
      loader: async () => 1,
    });
    h.runtime.defineResource({
      key: "down",
      mode: "push",
      schema: z.number(),
      loader: async () => 2,
      dependsOn: [{ resource: upstreamR }], // identity cascade, depth(down) = 1
    });

    await h.subscribe("up");
    await h.subscribe("down");

    upstreamR.notify();
    await tick();

    const up = h.pushesFor("up");
    const down = h.pushesFor("down");
    expect(up).toHaveLength(1);
    expect(down).toHaveLength(1); // cascade fired
    // Depth barrier: upstream (depth 0) sends before downstream (depth 1).
    expect(up[0]!.seq).toBeLessThan(down[0]!.seq);
  });

  test("version advances monotonically per (key,pk), one per notify", async () => {
    const h = harness();
    const r = h.runtime.defineResource({
      key: "ver",
      mode: "push",
      schema: z.number(),
      loader: async () => 1,
    });
    await h.subscribe("ver");

    r.notify();
    await tick();
    r.notify();
    await tick();

    const sent = h.pushesFor("ver");
    expect(sent.map((f) => f.version)).toEqual([1, 2]);
  });

  test("a notify arriving mid-flush is re-drained, once, after the in-flight flush", async () => {
    const h = harness();
    const slow = controllable(0);
    const slowR = h.runtime.defineResource({
      key: "s",
      mode: "push",
      schema: z.number(),
      loader: slow.loader,
    });
    const fastR = h.runtime.defineResource({
      key: "f",
      mode: "push",
      schema: z.number(),
      loader: async () => 1,
    });

    await h.subscribe("s");
    await h.subscribe("f");

    // Start a flush that parks on the slow loader.
    slow.block();
    slow.setValue(1);
    slowR.notify();
    await tick(); // flush is now mid-await on `s`, flushRunning = true

    // This notify lands during the in-flight flush.
    fastR.notify();
    await tick(); // the guard records flushAgain; it does NOT start a second flush

    // `f` is held back until the in-flight flush finishes (no overlap).
    expect(h.pushesFor("f")).toHaveLength(0);

    slow.release();
    await tick();

    // Both delivered, `f` exactly once, and AFTER `s` (single-active-flush order).
    expect(h.pushesFor("s")).toHaveLength(1);
    expect(h.pushesFor("f")).toHaveLength(1);
    expect(h.pushesFor("s")[0]!.seq).toBeLessThan(h.pushesFor("f")[0]!.seq);
  });
});
