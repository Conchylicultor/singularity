// bun:test suite for the recorder's wait-propagation decomposition. The core
// stays pure — the AsyncLocalStorage runtime and the deterministic clock are
// injected HERE, exactly the way server/internal/install.ts does at boot.
import { beforeEach, describe, expect, test } from "bun:test";
import { AsyncLocalStorage } from "node:async_hooks";
import {
  __contribute,
  captureFlightWindow,
  chargeWait,
  currentOriginClass,
  getLastLoaderReadSet,
  getReadSetIndex,
  getRuntimeProfile,
  installBackgroundLaneRuntime,
  installClock,
  installSpanContextRuntime,
  onSlowSpan,
  readGateGauges,
  recordEntrySpan,
  recordReadTables,
  recordSpan,
  registerGateGauge,
  removeReadSetTable,
  resetRuntimeProfile,
  runInBackgroundLane,
  seedReadSetIndex,
  type Aggregate,
  type EntryContext,
  type FlightSpan,
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

// The background-lane override, installed exactly as server/internal/install.ts does.
const backgroundLaneAls = new AsyncLocalStorage<true>();
installBackgroundLaneRuntime({
  run: (fn) => backgroundLaneAls.run(true, fn),
  active: () => backgroundLaneAls.getStore() === true,
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

  test("recordReadTables on a closed context is a no-op (the entry already flushed its read-set)", async () => {
    // A detached, fire-and-forget continuation still carries its loader's
    // EntryContext across the await (ALS semantics — same as the detached-child
    // test above), so it records a late read AFTER the loader entry closed and
    // flushed its tables into the index.
    let captured!: EntryContext;
    const gate = deferred();
    let late!: Promise<void>;
    await recordEntrySpan("loader", "l", () => {
      captured = als.getStore()!;
      recordReadTables(["real_table"]);
      late = (async () => {
        await gate.promise;
        recordReadTables(["late_table"]); // the context is closed by now
      })();
    });

    // The entry flushed exactly its one real read at finish.
    expect(getReadSetIndex().l).toEqual(["real_table"]);
    expect(captured.closed).toBe(true);

    // Let the late write land on the (now closed) context — it must be dropped.
    gate.resolve();
    await late;

    // Neither the closed context's own set nor the flushed index gained the
    // late table: the append was a structural no-op, not a silently-lost write.
    expect(captured.tables && [...captured.tables]).toEqual(["real_table"]);
    expect(getReadSetIndex().l).toEqual(["real_table"]);
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

describe("origin class", () => {
  // `currentOriginClass` reads the ROOT of the entry chain, not the innermost
  // entry — the whole point is that a `loader` says nothing about *why* it runs.
  test("a loader under flush → push is background (the cascade's root is flush)", async () => {
    let seen: unknown;
    await recordEntrySpan("flush", "flushNotifies", async () => {
      await recordEntrySpan("push", "res:tasks", async () => {
        await recordEntrySpan("loader", "tasks", () => {
          seen = currentOriginClass();
        });
      });
    });
    expect(seen).toBe("background");
  });

  test("the same loader under a sub-ack root is interactive", async () => {
    let seen: unknown;
    await recordEntrySpan("sub", "res:tasks", async () => {
      await recordEntrySpan("loader", "tasks", () => {
        seen = currentOriginClass();
      });
    });
    expect(seen).toBe("interactive");
  });

  test("the same loader under an http root is interactive", async () => {
    let seen: unknown;
    await recordEntrySpan("http", "GET /api/boot-snapshot", async () => {
      await recordEntrySpan("loader", "tasks", () => {
        seen = currentOriginClass();
      });
    });
    expect(seen).toBe("interactive");
  });

  test("a bare root maps through the table: job → background, sub → interactive", async () => {
    let job: unknown;
    let sub: unknown;
    await recordEntrySpan("job", "reindex", () => {
      job = currentOriginClass();
    });
    await recordEntrySpan("sub", "res:tasks", () => {
      sub = currentOriginClass();
    });
    expect(job).toBe("background");
    expect(sub).toBe("interactive");
  });

  test("no enclosing entry → undefined (boot/migrations stay ungated)", () => {
    expect(currentOriginClass()).toBeUndefined();
  });

  test("a detached continuation keeps its root's origin after the root closed", async () => {
    // The walk deliberately does NOT skip closed ancestors: it only reads `kind`,
    // and a fire-and-forget continuation spawned by a flush is still flush-origin
    // work long after the flush entry recorded itself.
    const gate = deferred();
    let detached!: Promise<unknown>;
    await recordEntrySpan("flush", "f", () => {
      detached = (async () => {
        await gate.promise;
        return currentOriginClass();
      })();
    });
    gate.resolve();
    expect(await detached).toBe("background");
  });

  test("runInBackgroundLane overrides an interactive origin chain", async () => {
    let inside: unknown;
    let after: unknown;
    await recordEntrySpan("http", "POST /api/tasks", async () => {
      await recordEntrySpan("loader", "tasks", () => {
        runInBackgroundLane(() => {
          inside = currentOriginClass();
        });
        // The scope is exactly the callback: the enclosing request is human
        // again the moment it returns.
        after = currentOriginClass();
      });
    });
    expect(inside).toBe("background");
    expect(after).toBe("interactive");
  });

  test("runInBackgroundLane with no entry at all is background, not undefined", () => {
    expect(runInBackgroundLane(() => currentOriginClass())).toBe("background");
  });

  test("the lane survives an await inside the scope (a transaction's whole life)", async () => {
    // `runInBackgroundLane` returns whatever `fn` returns — including a promise —
    // so ALS keeps the awaited DB work of an observability write in scope.
    const seen = await runInBackgroundLane(async () => {
      await Promise.resolve();
      return currentOriginClass();
    });
    expect(seen).toBe("background");
  });
});

describe("per-instance span identity", () => {
  // Every completed span ≥5ms lands in the flight ring, which is the only place
  // ids are observable — the aggregates group by label, by design.
  function completedByLabel(): Map<string, FlightSpan> {
    const w = captureFlightWindow({ windowStartMs: 0 });
    return new Map(w.completed.map((s) => [s.label, s]));
  }

  test("ids are unique and increase monotonically across entry and leaf spans", async () => {
    await recordEntrySpan("http", "e", async () => {
      fakeNow = 10;
      recordSpan("db", "q1", 10); // leaf: mints at record time
      fakeNow = 20;
    });
    recordSpan("db", "q2", 10);

    const spans = completedByLabel();
    const e = spans.get("e")!;
    const q1 = spans.get("q1")!;
    const q2 = spans.get("q2")!;
    // The entry mints at OPEN, so it precedes the leaf it encloses even though
    // it records last.
    expect(e.id).toBeLessThan(q1.id);
    expect(q1.id).toBeLessThan(q2.id);
    expect(new Set([e.id, q1.id, q2.id]).size).toBe(3);
  });

  test("resetRuntimeProfile does NOT restart the counter (live contexts keep their ids)", async () => {
    await recordEntrySpan("loader", "before", async () => {
      fakeNow = 10;
    });
    const before = completedByLabel().get("before")!.id;

    resetRuntimeProfile();
    fakeNow = 100;
    await recordEntrySpan("loader", "after", async () => {
      fakeNow = 110;
    });
    expect(completedByLabel().get("after")!.id).toBeGreaterThan(before);
  });

  test("a child entry's parentId is its enclosing entry's id; a top-level entry has none", async () => {
    await recordEntrySpan("flush", "f", async () => {
      fakeNow = 10;
      await recordEntrySpan("push", "p", async () => {
        fakeNow = 20;
      });
      fakeNow = 30;
    });

    const spans = completedByLabel();
    const f = spans.get("f")!;
    const p = spans.get("p")!;
    expect(f.parentId).toBeNull();
    expect(p.parentId).toBe(f.id);
    // A parent always OPENS first, so the edge always points backwards — this
    // is what makes the reconstructed tree acyclic by construction.
    expect(p.parentId!).toBeLessThan(p.id);
  });

  test("a leaf db span inside a loader entry carries that loader's id as parentId", async () => {
    await recordEntrySpan("loader", "tasks", async () => {
      fakeNow = 10;
      recordSpan("db", "select tasks", 10);
      fakeNow = 20;
    });

    const spans = completedByLabel();
    expect(spans.get("select tasks")!.parentId).toBe(spans.get("tasks")!.id);
  });

  test("two concurrent same-label loaders are distinct instances under their own parents", async () => {
    const gate = deferred();
    const parents = ["p1", "p2"].map((label) =>
      recordEntrySpan("push", label, async () => {
        await recordEntrySpan("loader", "tasks", async () => {
          await gate.promise;
        });
      }),
    );
    fakeNow = 20;
    gate.resolve();
    await Promise.all(parents);

    const w = captureFlightWindow({ windowStartMs: 0 });
    const loaders = w.completed.filter((s) => s.label === "tasks");
    const p1 = w.completed.find((s) => s.label === "p1")!;
    const p2 = w.completed.find((s) => s.label === "p2")!;
    // Same {kind,label} — indistinguishable before ids existed. Now each names
    // the exact push instance it ran under.
    expect(loaders).toHaveLength(2);
    expect(new Set(loaders.map((s) => s.parentId))).toEqual(new Set([p1.id, p2.id]));
  });
});

describe("flight recorder — ancestor closure", () => {
  test("open spans carry id/parentId matching the live EntryContext chain", async () => {
    await recordEntrySpan("flush", "f", async () => {
      const outer = als.getStore()!;
      await recordEntrySpan("loader", "l", async () => {
        const inner = als.getStore()!;
        fakeNow = 30;
        const w = captureFlightWindow({ windowStartMs: 0 });
        const of = w.open.find((s) => s.label === "f")!;
        const ol = w.open.find((s) => s.label === "l")!;
        expect(of.id).toBe(outer.id);
        expect(of.parentId).toBeNull();
        expect(ol.id).toBe(inner.id);
        expect(ol.parentId).toBe(outer.id);
      });
    });
  });

  test("a truncated open set never strands an OPEN ancestor", async () => {
    const gate = deferred();
    const live: EntryContext[] = [];
    // flush → push → three concurrent loaders: five entries, all registered
    // synchronously before the first await, all open at capture time.
    const run = recordEntrySpan("flush", "f", async () => {
      live.push(als.getStore()!);
      await recordEntrySpan("push", "p", async () => {
        live.push(als.getStore()!);
        await Promise.all(
          ["l1", "l2", "l3"].map((label) =>
            recordEntrySpan("loader", label, async () => {
              live.push(als.getStore()!);
              await gate.promise;
            }),
          ),
        );
      });
    });

    const w = captureFlightWindow({ windowStartMs: 0, maxOpen: 2 });
    expect(w.open.length).toBeGreaterThanOrEqual(2); // maxOpen is a SOFT cap
    const returned = new Set(w.open.map((s) => s.id));
    const byId = new Map(live.map((ctx) => [ctx.id, ctx]));
    for (const span of w.open) {
      if (span.parentId === null) continue;
      const parent = byId.get(span.parentId);
      // A hole in the middle of a chain would silently reparent a subtree. The
      // parent must be in the window, unless it is not an open ancestor at all
      // (closed, or never an entry) — a legitimate orphan.
      const isOpenAncestor = parent !== undefined && !parent.closed;
      expect(returned.has(span.parentId) || !isOpenAncestor).toBe(true);
    }
    // Uncapped: the whole live chain comes back, exactly linked.
    const full = captureFlightWindow({ windowStartMs: 0 });
    expect(full.open).toHaveLength(5);
    const flush = full.open.find((s) => s.label === "f")!;
    const push = full.open.find((s) => s.label === "p")!;
    expect(push.parentId).toBe(flush.id);
    for (const label of ["l1", "l2", "l3"]) {
      expect(full.open.find((s) => s.label === label)!.parentId).toBe(push.id);
    }

    gate.resolve();
    await run;
  });
});

describe("flight recorder — ring write precedes the notify loop", () => {
  test("a slow-span handler capturing synchronously sees the tripping span in completed", async () => {
    let captured: FlightWindow | undefined;
    let tripId: number | undefined;
    // The trip span is deregistered from `openEntries` before record() runs, so
    // only the ring can carry it. If the ring write came after this notify, the
    // span would be absent from its own trace and `child` would be an orphan.
    const sub = onSlowSpan(
      (span) => {
        if (span.label !== "trip") return;
        tripId = span.id;
        captured = captureFlightWindow({ windowStartMs: 0 });
      },
      { thresholdMs: 10 },
    );
    try {
      await recordEntrySpan("http", "trip", async () => {
        await recordEntrySpan("loader", "child", async () => {
          fakeNow = 20;
        });
        fakeNow = 30;
      });
    } finally {
      sub.dispose();
    }

    if (tripId === undefined) throw new Error("onSlowSpan never fired for the trip span");
    const trip = captured!.completed.find((s) => s.id === tripId);
    expect(trip?.label).toBe("trip");
    expect(captured!.completed.find((s) => s.label === "child")!.parentId).toBe(tripId);
  });
});

describe("flight recorder — open-entry registry", () => {
  test("capture mid-flight lists nested open entries with parentId/ageMs; empty after completion", async () => {
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
    expect(loader.waits).toBeUndefined(); // only materialized when non-empty
    const flush = mid.open.find((s) => s.kind === "flush")!;
    expect(flush.parentId).toBeNull();
    expect(loader.parentId).toBe(flush.id);
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
    const push = completed[0]!;
    const slow = completed[1]!;
    expect(slow.t0).toBe(0);
    expect(slow.t1).toBe(20);
    expect(slow.ageMs).toBe(20);
    expect(slow.parentId).toBe(push.id);
    expect(push.parentId).toBeNull();
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

describe("read-set index — per-run capture (getLastLoaderReadSet)", () => {
  // Simulate a loader run that reads `tables`, keyed by the loader label. Mirrors
  // the DB pool chokepoint: recordReadTables fires INSIDE the loader entry.
  async function runLoader(key: string, tables: string[]): Promise<void> {
    await recordEntrySpan("loader", key, () => {
      recordReadTables(tables);
    });
  }

  test("returns only the LAST run's tables (replace), while the index is the union", async () => {
    await runLoader("attempts", ["attempts_v", "conversations_v"]);
    // A later run reads a DIFFERENT set (e.g. a code change dropped conversations_v
    // and a prior mis-attribution had added `notifications`).
    await runLoader("attempts", ["attempts_v"]);

    // The append-only index still carries every table ever read (over-approximation).
    expect(getReadSetIndex().attempts).toEqual(["attempts_v", "conversations_v"]);
    // The per-run capture is ONLY the most recent run — the self-healing set.
    expect(getLastLoaderReadSet("attempts")).toEqual(["attempts_v"]);
  });

  test("undefined for a key with no captured loader run", () => {
    expect(getLastLoaderReadSet("never-ran")).toBeUndefined();
  });

  test("a run that reads no tables leaves the prior per-run capture intact", async () => {
    await runLoader("p", ["p_table"]);
    // A subsequent loader entry that reads nothing must NOT replace a real set with
    // empty (same gate as the index): the capture keeps the last non-empty run.
    await recordEntrySpan("loader", "p", () => {});
    expect(getLastLoaderReadSet("p")).toEqual(["p_table"]);
  });

  test("resetRuntimeProfile clears the per-run capture", async () => {
    await runLoader("p", ["p_table"]);
    resetRuntimeProfile();
    expect(getLastLoaderReadSet("p")).toBeUndefined();
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
