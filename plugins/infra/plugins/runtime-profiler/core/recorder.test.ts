// bun:test suite for the recorder's wait-propagation decomposition. The core
// stays pure — the AsyncLocalStorage runtime and the deterministic clock are
// injected HERE, exactly the way server/internal/install.ts does at boot.
import { beforeEach, describe, expect, test } from "bun:test";
import { AsyncLocalStorage } from "node:async_hooks";
import {
  __contribute,
  captureFlightWindow,
  chargeWait,
  getReadSetIndex,
  getRuntimeProfile,
  installClock,
  installSpanContextRuntime,
  readGateGauges,
  recordEntrySpan,
  recordSpan,
  registerGateGauge,
  removeReadSetTable,
  resetRuntimeProfile,
  seedReadSetIndex,
  type Aggregate,
  type EntryContext,
  type FlightWindow,
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

describe("flight recorder — open-entry registry", () => {
  test("capture mid-flight lists nested open entries with parents/ageMs; empty after completion", async () => {
    let mid!: FlightWindow;
    await recordEntrySpan("flush", "f", async () => {
      await recordEntrySpan("loader", "l", async () => {
        fakeNow = 30;
        mid = captureFlightWindow({ windowStartMs: 0 });
      });
    });

    expect(mid.atMs).toBe(30);
    expect(mid.open).toHaveLength(2);
    const loader = mid.open.find((s) => s.kind === "loader")!;
    expect(loader.label).toBe("l");
    expect(loader.t0).toBe(0);
    expect(loader.t1).toBeNull();
    expect(loader.ageMs).toBe(30);
    expect(loader.parents).toEqual([{ kind: "flush", label: "f" }]);
    expect(loader.waits).toBeUndefined(); // only materialized when non-empty
    const flush = mid.open.find((s) => s.kind === "flush")!;
    expect(flush.parents).toEqual([]);
    // Both entries closed → deregistered.
    expect(captureFlightWindow({ windowStartMs: 0 }).open).toHaveLength(0);
  });

  test("a throwing entry is still removed from the open registry", async () => {
    let thrown: unknown;
    try {
      await recordEntrySpan("loader", "boom", async () => {
        fakeNow = 10;
        throw new Error("boom");
      });
    } catch (err) {
      thrown = err;
    }
    expect((thrown as Error).message).toBe("boom");
    expect(captureFlightWindow({ windowStartMs: 0 }).open).toHaveLength(0);
  });

  test("an open span's live wait unions appear in the capture", async () => {
    await recordEntrySpan("loader", "l", async () => {
      fakeNow = 40;
      chargeWait("db-acquire", 40); // interval [0, 40]
      fakeNow = 50;
      const w = captureFlightWindow({ windowStartMs: 0 });
      const span = w.open[0]!;
      expect(span.waits).toEqual({ "db-acquire": 40 });
      expect(span.waitMs).toBe(40);
      // selfMs mid-flight: age 50 − busy 40 (coverage so far).
      expect(span.selfMs).toBe(10);
    });
  });
});

describe("flight recorder — completed ring", () => {
  test("a finished span ≥5ms appears with correct t0/t1 and immediate parent; a sub-5ms span does not", async () => {
    await recordEntrySpan("push", "p", async () => {
      await recordEntrySpan("loader", "slow", async () => {
        fakeNow = 20;
      });
      await recordEntrySpan("loader", "fast", async () => {
        fakeNow = 22; // 2ms — below the 5ms floor
      });
    });

    const completed = captureFlightWindow({ windowStartMs: 0 }).completed;
    // Newest→oldest: the enclosing push recorded last.
    expect(completed.map((s) => s.label)).toEqual(["p", "slow"]);
    const slow = completed[1]!;
    expect(slow.t0).toBe(0);
    expect(slow.t1).toBe(20);
    expect(slow.ageMs).toBe(20);
    expect(slow.parents).toEqual([{ kind: "push", label: "p" }]);
  });

  test("windowStartMs excludes spans completed before the window", async () => {
    await recordEntrySpan("loader", "old", async () => {
      fakeNow = 10;
    });
    fakeNow = 100;
    await recordEntrySpan("loader", "recent", async () => {
      fakeNow = 110;
    });
    const completed = captureFlightWindow({ windowStartMs: 50 }).completed;
    expect(completed.map((s) => s.label)).toEqual(["recent"]);
  });
});

describe("flight recorder — caps", () => {
  test("maxOpen and maxCompleted are respected; completed comes back newest first", async () => {
    for (const label of ["a", "b", "c"]) {
      const start = fakeNow;
      await recordEntrySpan("loader", label, async () => {
        fakeNow = start + 10;
      });
    }
    const w = captureFlightWindow({ windowStartMs: 0, maxCompleted: 2 });
    expect(w.completed.map((s) => s.label)).toEqual(["c", "b"]);

    // Three concurrently-open entries (registered synchronously before the
    // first await), capped at 2.
    const gate = deferred();
    const runs = ["x", "y", "z"].map((label) =>
      recordEntrySpan("loader", label, async () => {
        await gate.promise;
      }),
    );
    expect(captureFlightWindow({ windowStartMs: 0, maxOpen: 2 }).open).toHaveLength(2);
    gate.resolve();
    await Promise.all(runs);
  });
});

describe("flight recorder — gate gauges", () => {
  test("a registered gauge is read; duplicate layer registration throws", () => {
    registerGateGauge("test-gate", () => ({ active: 2, queued: 5, max: 4 }));
    expect(readGateGauges()["test-gate"]).toEqual({ active: 2, queued: 5, max: 4 });
    expect(() => registerGateGauge("test-gate", () => ({ active: 0, queued: 0, max: 0 }))).toThrow(
      "duplicate layer",
    );
  });

  test("resetRuntimeProfile clears the flight ring but keeps registered gauges", async () => {
    registerGateGauge("reset-gate", () => ({ active: 1, queued: 0, max: 1 }));
    await recordEntrySpan("loader", "l", async () => {
      fakeNow = 10;
    });
    expect(captureFlightWindow({ windowStartMs: 0 }).completed).toHaveLength(1);

    resetRuntimeProfile();
    expect(captureFlightWindow({ windowStartMs: 0 }).completed).toHaveLength(0);
    expect(readGateGauges()["reset-gate"]).toEqual({ active: 1, queued: 0, max: 1 });
  });
});

describe("read-set index — removeReadSetTable", () => {
  test("evicts a mis-attributed table from non-kept keys, leaving kept keys untouched", () => {
    seedReadSetIndex({
      attempts: ["attempts_v", "notifications"],
      notifications: ["notifications"],
    });
    const changed = removeReadSetTable("notifications", ["notifications"]);
    expect(changed).toEqual(["attempts"]);
    const index = getReadSetIndex();
    expect(index.attempts).toEqual(["attempts_v"]);
    expect(index.notifications).toEqual(["notifications"]); // kept
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
