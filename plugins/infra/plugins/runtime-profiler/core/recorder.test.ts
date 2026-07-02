// bun:test suite for the recorder's wait-propagation decomposition. The core
// stays pure — the AsyncLocalStorage runtime and the deterministic clock are
// injected HERE, exactly the way server/internal/install.ts does at boot.
import { beforeEach, describe, expect, test } from "bun:test";
import { AsyncLocalStorage } from "node:async_hooks";
import {
  __contribute,
  chargeWait,
  getRuntimeProfile,
  installClock,
  installSpanContextRuntime,
  recordEntrySpan,
  recordSpan,
  resetRuntimeProfile,
  type Aggregate,
  type EntryContext,
  type SpanKind,
  type Track,
} from "./recorder";

// Real ALS runtime so context propagates across awaits like in production.
const als = new AsyncLocalStorage<EntryContext>();
installSpanContextRuntime({
  run: (ctx, fn) => als.run(ctx, fn),
  current: () => als.getStore(),
});

let fakeNow = 0;

beforeEach(() => {
  fakeNow = 0;
  installClock(() => fakeNow);
  resetRuntimeProfile();
});

function agg(kind: SpanKind, label: string): Aggregate {
  const found = getRuntimeProfile().aggregates[kind].find((a) => a.label === label);
  if (!found) throw new Error(`no ${kind} aggregate for ${label}`);
  return found;
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("wait propagation", () => {
  test("a gate wait deep in a nested entry chain lands in every open ancestor", async () => {
    await recordEntrySpan("flush", "flushNotifies", async () => {
      await recordEntrySpan("push", "res:tasks", async () => {
        await recordEntrySpan("loader", "tasks", async () => {
          fakeNow = 50;
          chargeWait("loader-acquire", 50); // interval [0, 50]
          fakeNow = 60;
        });
      });
      fakeNow = 70;
    });

    const flush = agg("flush", "flushNotifies");
    const push = agg("push", "res:tasks");
    const loader = agg("loader", "tasks");
    for (const a of [flush, push, loader]) {
      expect(a.waits).toEqual({ "loader-acquire": 50 });
      expect(a.waitTotalMs).toBe(50);
    }
    // loader: wall 60 = wait 50 + self 10, no children.
    expect(loader.totalMs).toBe(60);
    expect(loader.childTotalMs).toBe(0);
    expect(loader.selfTotalMs).toBe(10);
    // push: wall 60, child (loader exec [0,60]) covers everything → self 0.
    expect(push.totalMs).toBe(60);
    expect(push.childTotalMs).toBe(60);
    expect(push.selfTotalMs).toBe(0);
    // flush: wall 70, child = push exec [0,60]; busy = wait ∪ child = [0,60].
    expect(flush.totalMs).toBe(70);
    expect(flush.childTotalMs).toBe(60);
    expect(flush.selfTotalMs).toBe(10);
  });

  test("concurrent children's overlapping waits union on the parent (< sum, ≤ wall)", async () => {
    await recordEntrySpan("flush", "f", async () => {
      const gateA = deferred();
      const gateB = deferred();
      const childA = recordEntrySpan("loader", "a", async () => {
        await gateA.promise;
        chargeWait("gate", 30); // resumes at now=40 → interval [10, 40]
      });
      const childB = recordEntrySpan("loader", "b", async () => {
        await gateB.promise;
        chargeWait("gate", 30); // resumes at now=50 → interval [20, 50]
      });
      fakeNow = 40;
      gateA.resolve();
      await childA;
      fakeNow = 50;
      gateB.resolve();
      await childB;
      fakeNow = 60;
    });

    const flush = agg("flush", "f");
    // Union of [10,40] ∪ [20,50] = [10,50] = 40ms — NOT the 60ms sum, and ≤ 60ms wall.
    expect(flush.waitTotalMs).toBe(40);
    expect(flush.waits).toEqual({ gate: 40 });
    expect(flush.totalMs).toBe(60);
    // Child executions [0,40] ∪ [0,50]: the streaming union sees [0,40] first
    // with an empty frontier → 40, then [0,50] adds the [40,50] tail → 50.
    expect(flush.childTotalMs).toBe(50);
    // busy = waits ∪ child execs under the end-ordered streaming union: the
    // waits cover [10,50]; child A's [0,40] arrives when the frontier is
    // already at 40, so its [0,10] head is (conservatively) not re-counted —
    // busy 40, self 20 (≥ the true 10, never negative).
    expect(flush.selfTotalMs).toBe(20);
    // Each child individually: wall 40/50, wait 30, self = remainder.
    expect(agg("loader", "a").waitTotalMs).toBe(30);
    expect(agg("loader", "a").selfTotalMs).toBe(10);
    expect(agg("loader", "b").waitTotalMs).toBe(30);
    expect(agg("loader", "b").selfTotalMs).toBe(20);
  });
});

describe("decomposition coherence", () => {
  test("leaf entry: waitMs + selfMs == wall; composite: waitMs + selfMs ≤ wall, childMs ≈ wall", async () => {
    await recordEntrySpan("loader", "leaf", async () => {
      fakeNow = 30;
      chargeWait("db-acquire", 30);
      fakeNow = 100;
    });
    const leaf = agg("loader", "leaf");
    expect(leaf.waitTotalMs + leaf.selfTotalMs).toBe(leaf.totalMs); // 30 + 70 = 100

    await recordEntrySpan("flush", "composite", async () => {
      await recordEntrySpan("push", "p", async () => {
        fakeNow = 150;
      });
      fakeNow = 160;
    });
    const composite = agg("flush", "composite");
    expect(composite.totalMs).toBe(60);
    expect(composite.childTotalMs).toBe(50); // push exec [100, 150]
    expect(composite.selfTotalMs).toBe(10);
    expect(composite.waitTotalMs + composite.selfTotalMs).toBeLessThanOrEqual(composite.totalMs);
    expect(composite.selfTotalMs).toBeGreaterThanOrEqual(0);
  });
});

describe("closed-ancestor safety", () => {
  test("a detached child finishing after its parent closed leaves the parent's record untouched", async () => {
    const gate = deferred();
    let child!: Promise<void>;
    await recordEntrySpan("push", "p", async () => {
      child = recordEntrySpan("loader", "detached", async () => {
        await gate.promise;
        chargeWait("gate", 50); // parent already closed by now
      });
      fakeNow = 10;
    });
    // Parent recorded at wall 10 with nothing charged yet.
    fakeNow = 100;
    gate.resolve();
    await child;

    const push = agg("push", "p");
    expect(push.totalMs).toBe(10);
    expect(push.waitTotalMs).toBe(0);
    expect(push.childTotalMs).toBe(0);
    expect(push.selfTotalMs).toBe(10);
    expect(push.waits).toBeUndefined();
    // The detached child still records itself fully: wait [50,100], wall 100.
    const detached = agg("loader", "detached");
    expect(detached.totalMs).toBe(100);
    expect(detached.waitTotalMs).toBe(50);
    expect(detached.selfTotalMs).toBe(50);
  });

  test("a closed intermediate ancestor is skipped, an open grandparent still charged", async () => {
    await recordEntrySpan("flush", "f", async () => {
      const gate = deferred();
      let child!: Promise<void>;
      await recordEntrySpan("push", "p", async () => {
        child = recordEntrySpan("loader", "l", async () => {
          await gate.promise;
          chargeWait("gate", 30); // now=50 → [20,50]; push closed, flush open
        });
      });
      fakeNow = 50;
      gate.resolve();
      await child;
      fakeNow = 60;
    });

    // The wait skipped the closed push and landed on the open flush.
    const flush = agg("flush", "f");
    expect(flush.waits).toEqual({ gate: 30 });
    expect(flush.waitTotalMs).toBe(30);
    // The loader's exec interval [0,50] also skipped the closed push and
    // charged the flush's childUnion (nearest OPEN ancestor).
    expect(flush.childTotalMs).toBe(50);
    const push = agg("push", "p");
    expect(push.waitTotalMs).toBe(0);
    expect(push.waits).toBeUndefined();
  });
});

describe("rolling max", () => {
  test("recentMaxMs decays past the window; maxMs/maxAgeMs retain the aged peak", () => {
    fakeNow = 1000;
    recordSpan("db", "q", 500);
    let a = agg("db", "q");
    expect(a.maxMs).toBe(500);
    expect(a.recentMaxMs).toBe(500);
    expect(a.maxAgeMs).toBe(0);

    // ~6 idle minutes later: the spike's bucket has left the 5-min window.
    fakeNow = 1000 + 360_000;
    a = agg("db", "q");
    expect(a.recentMaxMs).toBe(0);
    expect(a.maxMs).toBe(500);
    expect(a.maxAgeMs).toBe(360_000);

    // A new small record becomes the live recent max; the aged peak persists.
    recordSpan("db", "q", 100);
    a = agg("db", "q");
    expect(a.recentMaxMs).toBe(100);
    expect(a.maxMs).toBe(500);
    expect(a.maxAgeMs).toBe(360_000);
  });
});

describe("chargeWait fallbacks and markers", () => {
  test("no active entry → standalone db [layer] span", () => {
    chargeWait("loader-acquire", 25);
    const a = agg("db", "[loader-acquire]");
    expect(a.count).toBe(1);
    expect(a.totalMs).toBe(25);
    // Leaf-shaped record: the wait IS the span, decomposition defaults apply.
    expect(a.waitTotalMs).toBe(0);
    expect(a.selfTotalMs).toBe(25);
  });

  test("zero-ms marker creates the layer key with 0 and leaves waitMs at 0", async () => {
    await recordEntrySpan("loader", "l", async () => {
      fakeNow = 10;
      chargeWait("git-memo-hit", 0);
      fakeNow = 20;
    });
    const a = agg("loader", "l");
    expect(a.waits).toEqual({ "git-memo-hit": 0 });
    expect(a.waitTotalMs).toBe(0);
    expect(a.selfTotalMs).toBe(20);
  });
});

describe("__contribute streaming union", () => {
  test("clips the interval start to the floor", () => {
    const t: Track = { unionMs: 0, prevEnd: 0 };
    __contribute(t, -5, 10, 0);
    expect(t).toEqual({ unionMs: 10, prevEnd: 10 });
    const t2: Track = { unionMs: 0, prevEnd: 4 };
    __contribute(t2, 0, 10, 4);
    expect(t2).toEqual({ unionMs: 6, prevEnd: 10 });
  });

  test("a fully-covered interval contributes 0 and keeps the frontier", () => {
    const t: Track = { unionMs: 10, prevEnd: 10 };
    __contribute(t, 2, 8, 0);
    expect(t).toEqual({ unionMs: 10, prevEnd: 10 });
  });

  test("out-of-order ends never overcount; partial overlap adds only the tail", () => {
    const t: Track = { unionMs: 10, prevEnd: 10 };
    __contribute(t, 5, 15, 0); // overlaps [5,10] → adds only [10,15]
    expect(t).toEqual({ unionMs: 15, prevEnd: 15 });
    __contribute(t, 0, 12, 0); // end behind the frontier → 0
    expect(t).toEqual({ unionMs: 15, prevEnd: 15 });
  });
});
