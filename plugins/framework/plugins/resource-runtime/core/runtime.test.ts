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
import { type ResourceParams } from "./runtime";
// The harness / controllable-loader / tick helpers live in the shared
// test-support module (extracted so the invariant suites reuse the exact same
// fakes). `createHarness()` subsumes the old bespoke `harness()` (default 1
// socket), `feedHarness()` (a `readSet` option), and `revalHarness()` (subscribe
// takes an `etag`) with byte-identical behavior.
import { createHarness, controllable, tick } from "./test-support";

describe("flushNotifies — level-parallel", () => {
  test("a slow loader does not head-of-line-block an unrelated fast node", async () => {
    const h = createHarness();
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
    const h = createHarness();
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
    const h = createHarness();
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
    const h = createHarness();
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
 * test; in production it is `getReadSetIndex()[key]`. `createHarness` folds this
 * into its `ResourceRuntimeOptions` — no bespoke harness needed.
 */
const feedHarness = (readSetMap: Record<string, string[]>) =>
  createHarness({ readSet: (key) => readSetMap[key] ?? [] });

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
    h.runtime.defineResource(
      {
        key: "rows",
        schema: z.array(z.object({ id: z.string(), n: z.number() })),
        keyed: { keyOf: (r: unknown) => (r as { id: string }).id },
      },
      {
        // Identity table = the resource's own table, so a row UPDATE scopes.
        identityTable: "row_table",
        loader: (_p, ctx) => {
          // Full load returns two rows; a scoped load returns only the affected row.
          if (ctx) return [{ id: "a", n: 2 }];
          return [
            { id: "a", n: 1 },
            { id: "b", n: 1 },
          ];
        },
      },
    );
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
    h.runtime.defineResource(
      {
        key: "rows",
        schema: z.array(z.object({ id: z.string(), n: z.number() })),
        keyed: { keyOf: (r: unknown) => (r as { id: string }).id },
      },
      {
        // Intentionally unscoped: no `identityTable`, so a change's row-ids are not
        // provably this resource's keys — the runtime must FULL-recompute, never
        // scope. `recompute` is the sanctioned explicit FULL opt-out; it is
        // declaration-only (the runtime branches on identityTable absence, not on
        // this field) and only makes the keyed resource type-legal without scope.
        recompute: { kind: "full", reason: "test: FULL fallback when identityTable is absent" },
        loader: (_p, ctx) => {
          if (subscribed) postSubLoads.push(ctx !== undefined);
          return ctx
            ? [{ id: "a", n: 2 }]
            : [
                { id: "a", n: 1 },
                { id: "b", n: 1 },
              ];
        },
      },
    );
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
    h.runtime.defineResource(
      {
        key: "down",
        schema: z.array(z.object({ id: z.string(), n: z.number() })),
        keyed: { keyOf: (r: unknown) => (r as { id: string }).id },
      },
      {
        identityTable: "down_t",
        dependsOn: [{ resource: up, affectedMap: () => ["d1"] }],
        loader: (_p, ctx) => {
          if (subscribed) postSubLoads.push(ctx !== undefined);
          return ctx ? [{ id: "d1", n: 2 }] : [{ id: "d1", n: 1 }, { id: "d2", n: 1 }];
        },
      },
    );
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
    h.runtime.defineResource(
      {
        key: "down",
        schema: z.array(z.object({ id: z.string(), n: z.number() })),
        keyed: { keyOf: (r: unknown) => (r as { id: string }).id },
      },
      {
        identityTable: "down_t",
        dependsOn: [{ resource: up, affectedMap: () => ["d1"] }],
        loader: (_p, ctx) => {
          if (subscribed) postSubLoads.push(ctx !== undefined);
          return ctx ? [{ id: "d1", n: 2 }] : [{ id: "d1", n: 1 }, { id: "d2", n: 1 }];
        },
      },
    );
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

  test("a scoped cascade whose upstream signature is unchanged does not recompute the downstream", async () => {
    // Relevance gate: down derives only a COARSE projection of up's rows. When up
    // changes but that projection is unchanged (signature equal), the cascade is
    // skipped — no downstream recompute, no empty delta. A later change that DOES
    // move the signature propagates again. Mirrors a conversation
    // waitingFor/updatedAt write vs the attempts / agent-launches aggregates.
    const h = feedHarness({ up: ["up_t"], down: ["down_t", "up_t"] });
    const postSubLoads: boolean[] = [];
    let subscribed = false;
    let sig = "v1";
    const up = h.runtime.defineResource({
      key: "up",
      mode: "push",
      identityTable: "up_t",
      schema: z.number(),
      loader: async () => 1,
    });
    h.runtime.defineResource(
      {
        key: "down",
        schema: z.array(z.object({ id: z.string(), n: z.number() })),
        keyed: { keyOf: (r: unknown) => (r as { id: string }).id },
      },
      {
        identityTable: "down_t",
        dependsOn: [
          { resource: up, signature: () => new Map([["u1", sig]]), affectedMap: () => ["d1"] },
        ],
        loader: (_p, ctx) => {
          if (subscribed) postSubLoads.push(ctx !== undefined);
          return ctx ? [{ id: "d1", n: 2 }] : [{ id: "d1", n: 1 }];
        },
      },
    );
    await h.subscribe("down");
    subscribed = true;

    const change = (): void =>
      h.runtime.applyDbChange({
        table: "up_t",
        op: "U",
        ids: ["u1"],
        origin: "up_t",
        identityBase: "up_t",
      });

    // 1st change: signature "v1" is new → propagates → down recomputes (scoped).
    change();
    await tick();
    expect(postSubLoads).toEqual([true]);

    // 2nd change: signature still "v1" → unchanged → cascade skipped, no recompute.
    change();
    await tick();
    expect(postSubLoads).toEqual([true]);
    expect(h.pushesFor("down")).toHaveLength(1);

    // 3rd change: signature moves to "v2" → propagates again.
    sig = "v2";
    change();
    await tick();
    expect(postSubLoads).toEqual([true, true]);
  });

  test("a FULL upstream cascade clears remembered signatures so the next scoped change re-propagates", async () => {
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
    h.runtime.defineResource(
      {
        key: "down",
        schema: z.array(z.object({ id: z.string(), n: z.number() })),
        keyed: { keyOf: (r: unknown) => (r as { id: string }).id },
      },
      {
        identityTable: "down_t",
        dependsOn: [
          { resource: up, signature: () => new Map([["u1", "stable"]]), affectedMap: () => ["d1"] },
        ],
        loader: (_p, ctx) => {
          if (subscribed) postSubLoads.push(ctx !== undefined);
          return ctx ? [{ id: "d1", n: 2 }] : [{ id: "d1", n: 1 }];
        },
      },
    );
    await h.subscribe("down");
    subscribed = true;

    const scoped = (): void =>
      h.runtime.applyDbChange({
        table: "up_t",
        op: "U",
        ids: ["u1"],
        origin: "up_t",
        identityBase: "up_t",
      });

    scoped();
    await tick();
    expect(postSubLoads).toHaveLength(1); // first scoped change propagates (new sig)

    scoped();
    await tick();
    expect(postSubLoads).toHaveLength(1); // unchanged sig → skipped

    // A FULL upstream change (INSERT → ids null) clears the edge's signature memo.
    h.runtime.applyDbChange({
      table: "up_t",
      op: "I",
      ids: null,
      origin: "up_t",
      identityBase: "up_t",
    });
    await tick();
    const afterFull = postSubLoads.length;

    // The next scoped change must re-propagate even though the signature string is
    // unchanged — the memo was cleared by the FULL, so it can't wrongly skip.
    scoped();
    await tick();
    expect(postSubLoads.length).toBe(afterFull + 1);
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

describe("defineResource(contract, serverOpts) — keyed-ness derived from the descriptor", () => {
  // A stand-in for the browser-safe client descriptor: structurally a
  // ResourceContract. The keyed identity lives HERE only — the server never
  // restates it, which is the whole point (no drift, no missing-keyOf crash).
  const rowsContract = {
    key: "rows",
    schema: z.array(z.object({ id: z.string(), n: z.number() })),
    keyed: { keyOf: (r: unknown) => (r as { id: string }).id },
  };

  test("a keyed contract drives a scoped row delta without restating mode/keyOf", async () => {
    const h = feedHarness({ rows: ["row_table"] });
    h.runtime.defineResource(rowsContract, {
      identityTable: "row_table",
      loader: (_p, ctx) =>
        ctx
          ? [{ id: "a", n: 2 }]
          : [
              { id: "a", n: 1 },
              { id: "b", n: 1 },
            ],
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
    // A "delta" frame proves keyed mode took effect — a non-keyed resource would
    // ship "update". So the contract's `keyed` alone configured the runtime.
    expect(pushes[0]!.kind).toBe("delta");
  });

  test("a non-keyed contract honors serverOpts.mode (push)", async () => {
    const h = createHarness();
    h.runtime.defineResource(
      { key: "n", schema: z.number() },
      { mode: "push", loader: async () => 1 },
    );
    await h.subscribe("n");
    // sub-ack delivers a full value frame; nothing crashes wiring a bare contract.
    expect(h.frames.some((f) => f.key === "n")).toBe(true);
  });
});

/**
 * Conditional revalidation (ETag / 304). Pins the additive protocol contract:
 *
 *   - A resource WITHOUT `revalidate` (or a client that sends no etag) behaves
 *     exactly as before — sub-ack carries a value and no etag.
 *   - With `revalidate` + a matching client etag, the server answers `up-to-date`
 *     (no loader run, no value) and the client keeps its cache.
 *   - A miss (or first subscribe) runs the loader and attaches a fresh etag.
 *   - The HTTP fallback honors `If-None-Match` → 304, and stamps an `ETag` header.
 */
describe("conditional revalidation (ETag / up-to-date / 304)", () => {
  // `createHarness` already captures the FULL parsed frame (value + etag) with
  // faithful key presence, and its `subscribe` takes an `etag` — so the old
  // bespoke `revalHarness` collapses to a thin `sub(key, params?, etag?)` shim
  // over it (keeps these tests' call sites unchanged).
  const revalHarness = () => {
    const h = createHarness();
    return {
      runtime: h.runtime,
      frames: h.frames,
      sub: (key: string, params: ResourceParams = {}, etag?: string) =>
        h.subscribe(key, params, etag !== undefined ? { etag } : {}),
    };
  };

  test("no revalidate: sub-ack carries value and no etag (byte-identical)", async () => {
    const h = revalHarness();
    h.runtime.defineExternalResource({ key: "plain", mode: "push", schema: z.number(), loader: async () => 7 });
    await h.sub("plain");
    const ack = h.frames.find((f) => f.kind === "sub-ack")!;
    expect(ack.value).toBe(7);
    expect("etag" in ack).toBe(false);
  });

  test("first subscribe attaches a fresh etag to the sub-ack", async () => {
    const h = revalHarness();
    h.runtime.defineExternalResource({
      key: "r",
      mode: "push",
      schema: z.number(),
      loader: async () => 1,
      revalidate: async () => "sig-A",
    });
    await h.sub("r"); // no client etag → loader path
    const ack = h.frames.find((f) => f.kind === "sub-ack")!;
    expect(ack.value).toBe(1);
    // The signature is normalized into an opaque, header-safe token (hashed), so
    // it's a non-empty string that is NOT the raw `revalidate` return.
    expect(typeof ack.etag).toBe("string");
    expect((ack.etag as string).length).toBeGreaterThan(0);
    expect(ack.etag).not.toBe("sig-A");
  });

  test("matching client etag ⇒ up-to-date, loader is NOT run", async () => {
    const h = revalHarness();
    let loads = 0;
    h.runtime.defineExternalResource({
      key: "r",
      mode: "push",
      schema: z.number(),
      loader: async () => { loads++; return 1; },
      revalidate: async () => "sig-A",
    });
    // First subscribe (no etag) runs the loader and hands back the opaque token.
    await h.sub("r");
    const token = h.frames.find((f) => f.kind === "sub-ack")!.etag as string;
    expect(loads).toBe(1);
    h.frames.length = 0;
    // Resubscribe WITH that real token → up-to-date, loader NOT run again.
    await h.sub("r", {}, token);
    const ack = h.frames.find((f) => f.kind === "sub-ack");
    const utd = h.frames.find((f) => f.kind === "up-to-date");
    expect(ack).toBeUndefined();
    expect(utd).toBeTruthy();
    expect("value" in utd!).toBe(false);
    expect(loads).toBe(1); // the cure: no second loader for an unchanged resource
  });

  test("stale client etag ⇒ full sub-ack with the fresh etag", async () => {
    const h = revalHarness();
    let loads = 0;
    h.runtime.defineExternalResource({
      key: "r",
      mode: "push",
      schema: z.number(),
      loader: async () => { loads++; return 2; },
      revalidate: async () => "sig-B",
    });
    await h.sub("r", {}, "stale-token"); // client holds an OLD (non-matching) token
    const ack = h.frames.find((f) => f.kind === "sub-ack")!;
    expect(ack.value).toBe(2);
    expect(typeof ack.etag).toBe("string"); // fresh normalized token attached
    expect(ack.etag).not.toBe("stale-token");
    expect(loads).toBe(1);
  });

  test("HTTP: If-None-Match match ⇒ 304, else value + ETag header", async () => {
    const h = revalHarness();
    h.runtime.defineExternalResource({
      key: "r",
      mode: "invalidate",
      schema: z.number(),
      loader: async () => 5,
      revalidate: async () => "sig-A",
    });
    // First GET (no If-None-Match) → 200 + the opaque ETag token.
    const first = await h.runtime.handleResourceHttp(
      new Request("http://x/api/resources/r"),
      { key: "r" },
    );
    expect(first.status).toBe(200);
    const token = first.headers.get("ETag");
    expect(token).toBeTruthy();

    // Conditional GET with the real token → 304, empty body.
    const notModified = await h.runtime.handleResourceHttp(
      new Request("http://x/api/resources/r", { headers: { "If-None-Match": token! } }),
      { key: "r" },
    );
    expect(notModified.status).toBe(304);

    // A stale token → 200 with the value and the same fresh ETag.
    const fresh = await h.runtime.handleResourceHttp(
      new Request("http://x/api/resources/r", { headers: { "If-None-Match": "stale" } }),
      { key: "r" },
    );
    expect(fresh.status).toBe(200);
    expect(fresh.headers.get("ETag")).toBe(token);
    expect((await fresh.json()).value).toBe(5);
  });
});

describe("authorize — deferred subscription-authorization seam", () => {
  test("absent authorize ⇒ subscription is allowed (default, sub-ack sent)", async () => {
    const h = createHarness();
    h.runtime.defineResource({
      key: "r",
      mode: "invalidate",
      schema: z.number(),
      loader: async () => 1,
    });
    await h.subscribe("r");

    const acks = h.frames.filter((f) => f.key === "r" && f.kind === "sub-ack");
    expect(acks).toHaveLength(1);
    expect(h.frames.some((f) => f.kind === "sub-error")).toBe(false);
  });

  test("authorize returning false ⇒ sub-error/unauthorized, loader never runs", async () => {
    const h = createHarness();
    let loaded = false;
    h.runtime.defineResource({
      key: "r",
      mode: "invalidate",
      schema: z.number(),
      loader: async () => {
        loaded = true;
        return 1;
      },
      authorize: () => false,
    });
    await h.subscribe("r");

    const errs = h.frames.filter((f) => f.key === "r" && f.kind === "sub-error");
    expect(errs).toHaveLength(1);
    expect(errs[0]!.reason).toBe("unauthorized");
    // No initial value leaked, and the (side-effecting) loader was never invoked.
    expect(h.frames.some((f) => f.key === "r" && f.kind === "sub-ack")).toBe(false);
    expect(loaded).toBe(false);
  });

  test("authorize can decide per-params (async, allow one tuple, deny another)", async () => {
    const h = createHarness();
    h.runtime.defineResource<number, { id: string }>({
      key: "r",
      mode: "invalidate",
      schema: z.number(),
      loader: async () => 1,
      authorize: async (params) => params.id === "ok",
    });
    await h.subscribe("r", { id: "ok" });
    await h.subscribe("r", { id: "nope" });

    expect(h.frames.filter((f) => f.kind === "sub-ack")).toHaveLength(1);
    const errs = h.frames.filter((f) => f.kind === "sub-error");
    expect(errs).toHaveLength(1);
    expect(errs[0]!.reason).toBe("unauthorized");
  });

  test("a throwing authorize fails CLOSED (rejects the sub, no value)", async () => {
    const h = createHarness();
    let loaded = false;
    h.runtime.defineResource({
      key: "r",
      mode: "invalidate",
      schema: z.number(),
      loader: async () => {
        loaded = true;
        return 1;
      },
      authorize: () => {
        throw new Error("boom");
      },
    });
    await h.subscribe("r");

    const errs = h.frames.filter((f) => f.key === "r" && f.kind === "sub-error");
    expect(errs).toHaveLength(1);
    expect(errs[0]!.reason).toBe("unauthorized");
    expect(loaded).toBe(false);
  });
});
