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

    const slowR = h.runtime.defineExternalResource({
      key: "slow",
      mode: "push",
      schema: z.number(),
      loader: slow.loader,
    });
    const fastR = h.runtime.defineExternalResource({
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
    const upstreamR = h.runtime.defineExternalResource({
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
    const r = h.runtime.defineExternalResource({
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
    const slowR = h.runtime.defineExternalResource({
      key: "s",
      mode: "push",
      schema: z.number(),
      loader: slow.loader,
    });
    const fastR = h.runtime.defineExternalResource({
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

/**
 * A harness whose runtime is built with an injected L3 read-set hook so
 * `applyDbChange` can invert table→resource. `readSet` is a static map for the
 * test; in production it is `getReadSetIndex()[key]`.
 */
function feedHarness(readSetMap: Record<string, string[]>) {
  const runtime = createResourceRuntime({
    readSet: (key) => readSetMap[key] ?? [],
  });
  const frames: SentFrame[] = [];
  let seq = 0;
  const ws = {
    send(raw: string) {
      const msg = JSON.parse(raw) as { kind: string; key?: string; version?: number };
      if (msg.kind === "ping") return;
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
      await tick();
    },
    pushesFor(key: string) {
      return frames.filter((f) => f.key === key && f.kind !== "sub-ack");
    },
  };
}

describe("applyDbChange — L4 DB change-feed routing", () => {
  test("routes a table change to a subscribed param-less resource (full recompute on INSERT)", async () => {
    const h = feedHarness({ tasks: ["tasks"] });
    h.runtime.defineResource({
      key: "tasks",
      mode: "invalidate",
      schema: z.number(),
      loader: async () => 1,
    });
    await h.subscribe("tasks");

    h.runtime.applyDbChange({
      table: "tasks",
      op: "I",
      ids: ["a"],
      origin: "tasks",
      identityBase: "tasks",
    });
    await tick();

    expect(h.pushesFor("tasks")).toHaveLength(1);
    expect(h.pushesFor("tasks")[0]!.kind).toBe("invalidate");
  });

  test("unknown/unread table is a silent no-op", async () => {
    const h = feedHarness({ tasks: ["tasks"] });
    h.runtime.defineResource({
      key: "tasks",
      mode: "invalidate",
      schema: z.number(),
      loader: async () => 1,
    });
    await h.subscribe("tasks");

    h.runtime.applyDbChange({
      table: "unrelated_table",
      op: "U",
      ids: ["x"],
      origin: "unrelated_table",
      identityBase: "unrelated_table",
    });
    await tick();

    expect(h.pushesFor("tasks")).toHaveLength(0);
  });

  test("a single-row UPDATE scopes to a keyed resource (Layer-2 delta, not full)", async () => {
    const h = feedHarness({ rows: ["row_table"] });
    h.runtime.defineResource({
      key: "rows",
      mode: "keyed",
      // Identity table = the resource's own table, so a row UPDATE scopes.
      identityTable: "row_table",
      schema: z.array(z.object({ id: z.string(), n: z.number() })),
      keyOf: (r: { id: string }) => r.id,
      loader: (_p, ctx) => {
        // Full load returns two rows; a scoped load returns only the affected row.
        if (ctx) return [{ id: "a", n: 2 }];
        return [
          { id: "a", n: 1 },
          { id: "b", n: 1 },
        ];
      },
    });
    await h.subscribe("rows");

    h.runtime.applyDbChange({
      table: "row_table",
      op: "U",
      ids: ["a"],
      origin: "row_table",
      identityBase: "row_table",
    });
    await tick();

    const pushes = h.pushesFor("rows");
    expect(pushes).toHaveLength(1);
    // Scoped → a "delta" frame (FULL would be "update" because membership is asserted).
    expect(pushes[0]!.kind).toBe("delta");
  });

  test("without identityTable, a row UPDATE degrades to FULL (no key-space corruption)", async () => {
    const h = feedHarness({ rows: ["row_table"] });
    // Record whether each post-subscribe load was scoped (`ctx` present) or FULL.
    // The sub-ack also loads (full) to seed the snapshot, so we only inspect
    // loads the change provoked.
    const postSubLoads: boolean[] = [];
    let subscribed = false;
    h.runtime.defineResource({
      key: "rows",
      mode: "keyed",
      // No identityTable: the change's ids are not provably this resource's keys,
      // so the runtime must NOT scope — it recomputes FULL.
      schema: z.array(z.object({ id: z.string(), n: z.number() })),
      keyOf: (r: { id: string }) => r.id,
      loader: (_p, ctx) => {
        if (subscribed) postSubLoads.push(ctx !== undefined);
        return ctx
          ? [{ id: "a", n: 2 }]
          : [
              { id: "a", n: 1 },
              { id: "b", n: 1 },
            ];
      },
    });
    await h.subscribe("rows");
    subscribed = true;

    h.runtime.applyDbChange({
      table: "row_table",
      op: "U",
      ids: ["a"],
      origin: "row_table",
      identityBase: "row_table",
    });
    await tick();

    // The change provoked a single FULL recompute (no scoped ctx) — the ids are
    // not provably this resource's keys without a declared identity.
    expect(postSubLoads).toEqual([false]);
  });

  test("an edge-covered origin is suppressed on a direct read-set match (the edge delivers it scoped)", async () => {
    // down reads BOTH its own table and the upstream's table, but depends on up
    // via an affectedMap edge. A change to up_t must reach down ONCE, scoped via
    // the edge — the direct read-set match on up_t is suppressed so it can't
    // FULL-absorb the scoped delivery.
    const h = feedHarness({ up: ["up_t"], down: ["down_t", "up_t"] });
    const postSubLoads: boolean[] = [];
    let subscribed = false;
    const up = h.runtime.defineResource({
      key: "up",
      mode: "push",
      identityTable: "up_t",
      schema: z.number(),
      loader: async () => 1,
    });
    h.runtime.defineResource({
      key: "down",
      mode: "keyed",
      identityTable: "down_t",
      schema: z.array(z.object({ id: z.string(), n: z.number() })),
      keyOf: (r: { id: string }) => r.id,
      dependsOn: [{ resource: up, affectedMap: () => ["d1"] }],
      loader: (_p, ctx) => {
        if (subscribed) postSubLoads.push(ctx !== undefined);
        return ctx ? [{ id: "d1", n: 2 }] : [{ id: "d1", n: 1 }, { id: "d2", n: 1 }];
      },
    });
    await h.subscribe("down");
    subscribed = true;

    h.runtime.applyDbChange({
      table: "up_t",
      op: "U",
      ids: ["u1"],
      origin: "up_t",
      identityBase: "up_t",
    });
    await tick();

    const pushes = h.pushesFor("down");
    // Exactly one frame (the direct read-set match on up_t was suppressed), and it
    // was a single SCOPED recompute delivered via the edge (loader saw ctx).
    expect(pushes).toHaveLength(1);
    expect(pushes[0]!.kind).toBe("delta");
    expect(postSubLoads).toEqual([true]);
  });

  test("a secondary-view FULL for a covered origin does not absorb the scoped edge delivery", async () => {
    // Mirrors conversations→attempts: a base change fans out onto the downstream's
    // identity view as FULL (origin = the upstream's identity, identityBase =
    // downstream identity). Because the origin is edge-covered, that FULL is
    // dropped, leaving the scoped edge delivery intact.
    const h = feedHarness({ up: ["up_t"], down: ["down_v", "up_t"] });
    const postSubLoads: boolean[] = [];
    let subscribed = false;
    const up = h.runtime.defineResource({
      key: "up",
      mode: "push",
      identityTable: "up_t",
      schema: z.number(),
      loader: async () => 1,
    });
    h.runtime.defineResource({
      key: "down",
      mode: "keyed",
      identityTable: "down_t",
      schema: z.array(z.object({ id: z.string(), n: z.number() })),
      keyOf: (r: { id: string }) => r.id,
      dependsOn: [{ resource: up, affectedMap: () => ["d1"] }],
      loader: (_p, ctx) => {
        if (subscribed) postSubLoads.push(ctx !== undefined);
        return ctx ? [{ id: "d1", n: 2 }] : [{ id: "d1", n: 1 }, { id: "d2", n: 1 }];
      },
    });
    await h.subscribe("down");
    subscribed = true;

    // The identity-forwarded scoped change to up_t…
    h.runtime.applyDbChange({
      table: "up_t",
      op: "U",
      ids: ["u1"],
      origin: "up_t",
      identityBase: "up_t",
    });
    // …and the secondary-view FULL fanout of the same base change onto down_v
    // (down's identity view), tagged with the originating base up_t.
    h.runtime.applyDbChange({
      table: "down_v",
      op: "U",
      ids: null,
      origin: "up_t",
      identityBase: "down_t",
    });
    await tick();

    const pushes = h.pushesFor("down");
    expect(pushes).toHaveLength(1);
    // The scoped edge delivery survived (a single load, with ctx); the
    // secondary-view FULL for the same covered origin was dropped, so it could
    // not absorb it.
    expect(postSubLoads).toEqual([true]);
  });

  test("DELETE degrades to FULL (a vanished row can't scope)", async () => {
    const h = feedHarness({ rows: ["row_table"] });
    h.runtime.defineResource({
      key: "rows",
      mode: "invalidate",
      schema: z.number(),
      loader: async () => 1,
    });
    await h.subscribe("rows");

    h.runtime.applyDbChange({
      table: "row_table",
      op: "D",
      ids: ["a"],
      origin: "row_table",
      identityBase: "row_table",
    });
    await tick();
    expect(h.pushesFor("rows")).toHaveLength(1);
  });

  test("fans out to every subscribed params tuple", async () => {
    const h = feedHarness({ doc: ["docs"] });
    h.runtime.defineResource({
      key: "doc",
      mode: "invalidate",
      schema: z.number(),
      loader: async () => 1,
    });
    await h.subscribe("doc", { id: "1" });
    await h.subscribe("doc", { id: "2" });

    h.runtime.applyDbChange({
      table: "docs",
      op: "I",
      ids: null,
      origin: "docs",
      identityBase: "docs",
    });
    await tick();

    // Two distinct subscribed params → two invalidate frames.
    expect(h.pushesFor("doc")).toHaveLength(2);
  });

  test("never throws on a malformed change (defensive no-op)", () => {
    const h = feedHarness({});
    expect(() =>
      // @ts-expect-error — exercising the defensive path with a bad shape.
      h.runtime.applyDbChange({ table: "x", op: "U", ids: undefined }),
    ).not.toThrow();
  });

  test("notifyStatsFor counts hand vs feed sources", async () => {
    const h = feedHarness({ tasks: ["tasks"] });
    const r = h.runtime.defineExternalResource({
      key: "tasks",
      mode: "invalidate",
      schema: z.number(),
      loader: async () => 1,
    });
    await h.subscribe("tasks");

    r.notify(); // hand
    h.runtime.applyDbChange({
      table: "tasks",
      op: "I",
      ids: ["a"],
      origin: "tasks",
      identityBase: "tasks",
    }); // feed
    await tick();

    const stats = h.runtime.notifyStatsFor("tasks");
    expect(stats.hand).toBe(1);
    expect(stats.feed).toBe(1);
  });
});
