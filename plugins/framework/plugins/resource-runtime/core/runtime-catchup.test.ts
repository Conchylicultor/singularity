/**
 * Over-replay idempotence + the L2 persist-hook calling contract. Run with
 * `bun test plugins/framework/plugins/resource-runtime/core/runtime-catchup.test.ts`.
 *
 * The L2 cold-boot catch-up (`live-state-snapshot/catch-up.ts`) replays changelog
 * rows through the SAME `applyDbChange` the live LISTEN consumer uses. Its safety
 * rests on "over-replay is harmless / under-replay is impossible"
 * (`research/2026-06-22-global-live-state-l2-persisted-materialization.md` §2/§6):
 * replaying an already-reflected change recomputes an identical value, the keyed
 * diff comes back empty, and NO frame is sent. This file pins that at the runtime
 * seam, plus the persist-hook calling contract
 * (`shouldPersist`/`captureWatermark`/`persistSnapshot`) that catch-up leans on.
 *
 * The xmin-vs-changelog-floor ARITHMETIC and the `persist.ts` SQL live behind the
 * `db` singleton and are out of reach at this fake-injection seam (filed as a
 * follow-up DB-backed harness) — this file covers only the cascade + hook-contract
 * half, which is fully fake-testable.
 */

import { test, expect, describe } from "bun:test";
import { z } from "zod";
import { createHarness, tick, makeClientView } from "./test-support";

const rowsSchema = z.array(z.object({ id: z.string(), n: z.number() }));
const keyOf = (r: unknown) => (r as { id: string }).id;

describe("over-replay idempotence", () => {
  test("replaying the same keyed UPDATE twice: first ships a delta, the second is an empty-diff no-op (no frame)", async () => {
    const pushLog: Array<{ changed: boolean }> = [];
    const h = createHarness({
      readSet: () => ["row_table"],
      onPush: (_key, info) => pushLog.push({ changed: info.changed }),
    });
    // The DB truth the loader reflects. sub-ack seeds the snapshot from [a:1,b:1];
    // then the truth moves to a:2. BOTH replays load that same a:2 truth.
    let truth = [{ id: "a", n: 1 }, { id: "b", n: 1 }];
    h.runtime.defineResource(
      { key: "rows", schema: rowsSchema, keyed: { keyOf } },
      {
        identityTable: "row_table",
        loader: (_p, c) => (c ? truth.filter((r) => c.affectedIds.includes(r.id)) : truth),
      },
    );
    await h.subscribe("rows"); // snapshot seeded: a:1, b:1
    truth = [{ id: "a", n: 2 }, { id: "b", n: 1 }];

    const replay = () =>
      h.runtime.applyDbChange({ table: "row_table", op: "U", ids: ["a"], origin: "row_table", identityBase: "row_table" });

    // First replay: a:1 → a:2 is a real change → one delta, changed:true.
    replay();
    await tick();
    expect(pushLog).toEqual([{ changed: true }]);
    expect(h.pushesFor("rows").filter((f) => f.kind === "delta")).toHaveLength(1);

    // Second (over-)replay: identical truth → empty scoped diff → onPush
    // changed:false, and NO second delta frame is sent.
    replay();
    await tick();
    expect(pushLog).toEqual([{ changed: true }, { changed: false }]);
    expect(h.pushesFor("rows").filter((f) => f.kind === "delta")).toHaveLength(1); // still just the one

    // The client simulator lands in the identical state after both replays: a:2,
    // b:1, one delta applied, zero drift.
    const cv = makeClientView(keyOf);
    cv.applyAll(h.frames);
    expect(cv.value).toEqual([{ id: "a", n: 2 }, { id: "b", n: 1 }]);
    expect(cv.driftResubs).toBe(0);
  });
});

describe("recomputeResource", () => {
  test("routes one FULL feed notify to subscribers (exactly one push)", async () => {
    const h = createHarness();
    h.runtime.defineResource({ key: "k", mode: "push", schema: z.number(), loader: async () => 1 });
    await h.subscribe("k");

    h.runtime.recomputeResource("k");
    await tick();

    const pushes = h.pushesFor("k");
    expect(pushes).toHaveLength(1);
    expect(pushes[0]!.kind).toBe("update"); // a FULL value push
    expect(pushes[0]!.version).toBe(1);
  });

  test("is a no-op for an unknown key (never throws)", async () => {
    const h = createHarness();
    expect(() => h.runtime.recomputeResource("nope")).not.toThrow();
    await tick();
    expect(h.frames).toHaveLength(0);
  });
});

describe("L2 persist-hook calling contract", () => {
  // A persisted keyed resource + injected fakes recording into a shared ordered
  // call-log. `shouldPersist` selects the key; `lastReadSet` (the per-run capture)
  // supplies `tablesRead`, falling back to the `readSet` union when absent.
  function persistHarness(overrides: {
    captureWatermark?: () => Promise<string>;
    persistSnapshot?: (
      key: string,
      pk: string,
      value: unknown,
      wm: string,
      tables: readonly string[],
    ) => Promise<void>;
    loader?: (ctx?: { affectedIds: readonly string[] }) => { id: string; n: number }[];
    lastReadSet?: (key: string) => string[] | undefined;
  }) {
    const log: string[] = [];
    const persistArgs: Array<{ key: string; pk: string; value: unknown; wm: string; tables: readonly string[] }> = [];
    const h = createHarness({
      readSet: (k) => (k === "p" ? ["p_table"] : []),
      lastReadSet: overrides.lastReadSet,
      shouldPersist: (k) => k === "p",
      captureWatermark:
        overrides.captureWatermark ??
        (async () => {
          log.push("wm");
          return "xmin-7";
        }),
      persistSnapshot:
        overrides.persistSnapshot ??
        (async (key, pk, value, wm, tables) => {
          log.push("persist");
          persistArgs.push({ key, pk, value, wm, tables });
        }),
    });
    h.runtime.defineResource(
      { key: "p", schema: rowsSchema, keyed: { keyOf } },
      {
        identityTable: "p_table",
        loader: (_p, c) => {
          log.push(c === undefined ? "load:FULL" : "load:scoped");
          return overrides.loader ? overrides.loader(c) : [{ id: "a", n: 1 }];
        },
      },
    );
    return { h, log, persistArgs };
  }

  test("captureWatermark is called BEFORE the loader's first read", async () => {
    const { h, log } = persistHarness({});
    h.runtime.recomputeResource("p"); // zero subscribers — still recomputes (below)
    await tick();
    expect(log.indexOf("wm")).toBeGreaterThanOrEqual(0);
    expect(log.indexOf("wm")).toBeLessThan(log.indexOf("load:FULL"));
  });

  test("a persisted entry with ZERO subscribers still recomputes FULL and persists (value + watermark + tablesRead)", async () => {
    const { h, log, persistArgs } = persistHarness({});
    h.runtime.recomputeResource("p"); // nobody subscribed
    await tick();

    // Full recompute + persist even with no subscriber: needValue is forced.
    expect(log).toEqual(["wm", "load:FULL", "persist"]);
    expect(persistArgs).toHaveLength(1);
    expect(persistArgs[0]!.value).toEqual([{ id: "a", n: 1 }]); // the FULL value
    expect(persistArgs[0]!.wm).toBe("xmin-7"); // the captured watermark
    expect(persistArgs[0]!.tables).toEqual(["p_table"]); // fallback to opts.readSet (no lastReadSet)
    expect(persistArgs[0]!.pk).toBe(JSON.stringify({})); // param-less pk

    // Nothing shipped (no subscriber) — persistence is decoupled from delivery.
    expect(h.frames).toHaveLength(0);
  });

  test("persists the PER-RUN read-set (replace, self-healing) over the union when lastReadSet is present", async () => {
    // The union (`readSet`) still carries a stale `notifications` edge from a past
    // mis-attribution; the per-run capture (`lastReadSet`) has only what this FULL
    // run actually read. The persist must use the per-run set so the durable seed
    // sheds the stale edge instead of re-persisting it forever.
    const persistArgs: Array<{ tables: readonly string[] }> = [];
    const h = createHarness({
      readSet: (k) => (k === "p" ? ["p_table", "notifications"] : []), // stale union
      lastReadSet: (k) => (k === "p" ? ["p_table"] : undefined), // clean per-run
      shouldPersist: (k) => k === "p",
      captureWatermark: async () => "xmin-9",
      persistSnapshot: async (_key, _pk, _value, _wm, tables) => {
        persistArgs.push({ tables });
      },
    });
    h.runtime.defineResource(
      { key: "p", schema: rowsSchema, keyed: { keyOf } },
      { identityTable: "p_table", loader: () => [{ id: "a", n: 1 }] },
    );
    h.runtime.recomputeResource("p");
    await tick();
    expect(persistArgs).toHaveLength(1);
    expect(persistArgs[0]!.tables).toEqual(["p_table"]); // per-run wins, `notifications` shed
  });

  test("a persisted entry is forced to FULL even on a scoped change (loader gets ctx === undefined)", async () => {
    const { h, log } = persistHarness({});
    // A scoped feed change would normally hand the loader `ctx.affectedIds`; a
    // persisted entry ignores it and recomputes FULL (never persists a partial).
    h.runtime.applyDbChange({ table: "p_table", op: "U", ids: ["a"], origin: "p_table", identityBase: "p_table" });
    await tick();
    expect(log).toEqual(["wm", "load:FULL", "persist"]); // load:scoped never appears
  });

  test("persistSnapshot is NEVER called on loader failure (but captureWatermark was)", async () => {
    const { h, log } = persistHarness({
      loader: () => {
        throw new Error("loader boom");
      },
    });
    h.runtime.recomputeResource("p");
    await tick();
    // Watermark captured, loader ran and threw — no persist on the failure path.
    expect(log).toEqual(["wm", "load:FULL"]);
  });

  test("persistSnapshot throwing does NOT block the subscriber's frame", async () => {
    const { h } = persistHarness({
      persistSnapshot: async () => {
        throw new Error("persist boom");
      },
    });
    await h.subscribe("p");
    h.runtime.applyDbChange({ table: "p_table", op: "U", ids: ["a"], origin: "p_table", identityBase: "p_table" });
    await tick();
    // The persist rejected, but the subscriber still received its push.
    expect(h.pushesFor("p")).toHaveLength(1);
  });

  test("captureWatermark throwing does NOT block the frame and skips the persist", async () => {
    const log: string[] = [];
    const { h } = persistHarness({
      captureWatermark: async () => {
        throw new Error("wm boom");
      },
      persistSnapshot: async () => {
        log.push("persist");
      },
    });
    await h.subscribe("p");
    h.runtime.applyDbChange({ table: "p_table", op: "U", ids: ["a"], origin: "p_table", identityBase: "p_table" });
    await tick();
    // Frame delivered; persist skipped (no watermark to stamp).
    expect(h.pushesFor("p")).toHaveLength(1);
    expect(log).toEqual([]);
  });
});
