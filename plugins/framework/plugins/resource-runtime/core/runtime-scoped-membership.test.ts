/**
 * M5 opt-in scoped membership (`scopedMembership`) — the runtime half. Run with
 * `bun test plugins/framework/plugins/resource-runtime/core/runtime-scoped-membership.test.ts`.
 *
 * `scopedMembership` lets a keyed own-identity resource absorb row-level
 * INSERT/DELETE/where-flip changes INCREMENTALLY instead of FULL-recomputing:
 * `applyDbChange` scopes I/D (not just U) to the resource's own keys, and
 * `drainEntry` runs the membership path (`diffKeyedScopedMembership`) — refilling
 * only the changed rows, running the ids-only `orderOf` query ONLY on an entry, and
 * shipping a delta that asserts the new `order`. This file pins the runtime
 * behaviors from `research/2026-07-03-global-scoped-membership-m5.md` §Tests:
 *
 *   - DELETE ships a delta with `order` and runs ZERO loaders (5a);
 *   - INSERT refills once + runs `orderOf` exactly once (5b);
 *   - a mixed I/U/D window coalesces to one frame;
 *   - a sticky-FULL contributor absorbs a membership change (FULL recompute);
 *   - an empty (no-op) window bumps no version and ships no frame;
 *   - a PERSISTED entry reconstructs+persists a FULL-equal value, watermark before
 *     the refill;
 *   - a scoped change with no snapshot degrades to FULL, then resumes incremental;
 *   - a persisted sm snapshot survives the N→0 sub transition;
 *   - a DELETE cascades FULL downstream while an INSERT cascades scoped;
 *   - default-off (no `scopedMembership`) is frame-for-frame the pre-M5 behavior.
 *
 * The pure membership DIFF (all the id-set edge cases + the property fuzz vs the
 * FULL oracle) lives in `keyed-diff.test.ts`; this file is the runtime wiring.
 */

import { test, expect, describe } from "bun:test";
import { z } from "zod";
import { createHarness, tick, makeClientView, type RecordedFrame } from "./test-support";

const rowsSchema = z.array(z.object({ id: z.string(), n: z.number() }));
const keyOf = (r: unknown) => (r as { id: string }).id;

// A simulated identity table: id → { n (content), where (membership flag) }.
function makeTable() {
  const table = new Map<string, { n: number; where: boolean }>();
  const members = (): { id: string; n: number }[] =>
    [...table.entries()]
      .filter(([, c]) => c.where)
      .map(([id, c]) => ({ id, n: c.n }))
      .sort((a, b) => (a.id < b.id ? -1 : 1));
  const orderIds = (): string[] => members().map((r) => r.id);
  return { table, members, orderIds };
}

// A keyed `scopedMembership` resource "rows" over a simulated table, recording how
// each load was scoped ("FULL" | sorted affected ids) and counting `orderOf` runs.
// `log` (optional) receives ordered "wm"/"load:*"/"persist" markers for the
// persist-ordering assertions. `runtimeOpts` folds in shouldPersist/persist hooks.
function membershipHarness(runtimeOpts: Parameters<typeof createHarness>[0] = {}, log?: string[]) {
  const { table, members, orderIds } = makeTable();
  const loaderCalls: string[] = [];
  let orderOfCalls = 0;
  const h = createHarness({ readSet: () => ["row_table"], ...runtimeOpts });
  h.runtime.defineResource(
    { key: "rows", schema: rowsSchema, keyed: { keyOf } },
    {
      identityTable: "row_table",
      scopedMembership: {
        orderOf: async () => {
          orderOfCalls++;
          return orderIds();
        },
      },
      loader: (_p, c) => {
        if (c === undefined) {
          loaderCalls.push("FULL");
          log?.push("load:FULL");
          return members();
        }
        loaderCalls.push([...c.affectedIds].sort().join(","));
        log?.push("load:scoped");
        return c.affectedIds
          .filter((id) => table.get(id)?.where)
          .map((id) => ({ id, n: table.get(id)!.n }));
      },
    },
  );
  const feed = (op: "I" | "U" | "D", ids: string[] | null) =>
    h.runtime.applyDbChange({ table: "row_table", op, ids, origin: "row_table", identityBase: "row_table" });
  const insert = (id: string, n: number, where = true) => {
    table.set(id, { n, where });
    feed("I", [id]);
  };
  const update = (id: string, mut: (c: { n: number; where: boolean }) => void) => {
    mut(table.get(id)!);
    feed("U", [id]);
  };
  const del = (id: string) => {
    table.delete(id);
    feed("D", [id]);
  };
  return { h, table, members, loaderCalls, orderOf: () => orderOfCalls, feed, insert, update, del };
}

const deltas = (h: ReturnType<typeof createHarness>) =>
  h.pushesFor("rows").filter((f) => f.kind === "delta");

describe("scopedMembership — DELETE (5a: zero-loader membership shrink)", () => {
  test("a DELETE ships a delta with deletes + order and runs ZERO loaders", async () => {
    const m = membershipHarness();
    m.table.set("a", { n: 1, where: true });
    m.table.set("b", { n: 1, where: true });
    m.table.set("c", { n: 1, where: true });
    await m.h.subscribe("rows"); // FULL sub-ack seeds snapshot [a,b,c]
    m.loaderCalls.length = 0;

    m.del("b");
    await tick();

    const ds = deltas(m.h);
    expect(ds).toHaveLength(1);
    expect(ds[0]!.deletes).toEqual(["b"]);
    expect(ds[0]!.order).toEqual(["a", "c"]);
    expect(ds[0]!.upserts).toEqual([]);
    expect(m.loaderCalls).toEqual([]); // no refill — order came from the snapshot
    expect(m.orderOf()).toBe(0); // no entry → no orderOf

    const cv = makeClientView(keyOf);
    cv.applyAll(m.h.frames);
    expect(cv.value).toEqual([{ id: "a", n: 1 }, { id: "c", n: 1 }]);
    expect(cv.driftResubs).toBe(0);
  });
});

describe("scopedMembership — INSERT (5b: scoped refill + one orderOf)", () => {
  test("an INSERT refills exactly the new id and runs orderOf exactly once, placing it in order", async () => {
    const m = membershipHarness();
    m.table.set("a", { n: 1, where: true });
    m.table.set("c", { n: 1, where: true });
    await m.h.subscribe("rows"); // snapshot [a,c]
    m.loaderCalls.length = 0;

    m.insert("b", 7);
    await tick();

    expect(m.loaderCalls).toEqual(["b"]); // one scoped refill of just the new id
    expect(m.orderOf()).toBe(1); // exactly one ordered-membership query
    const ds = deltas(m.h);
    expect(ds).toHaveLength(1);
    expect(ds[0]!.upserts).toEqual([["b", { id: "b", n: 7 }]]);
    expect(ds[0]!.deletes).toEqual([]);
    expect(ds[0]!.order).toEqual(["a", "b", "c"]);

    const cv = makeClientView(keyOf);
    cv.applyAll(m.h.frames);
    expect(cv.value).toEqual([{ id: "a", n: 1 }, { id: "b", n: 7 }, { id: "c", n: 1 }]);
    expect(cv.driftResubs).toBe(0);
  });
});

describe("scopedMembership — coalescing", () => {
  test("a mixed I/U/D window coalesces to a single delta frame", async () => {
    const m = membershipHarness();
    m.table.set("a", { n: 1, where: true });
    m.table.set("b", { n: 1, where: true });
    m.table.set("c", { n: 1, where: true });
    await m.h.subscribe("rows"); // snapshot [a,b,c]
    m.loaderCalls.length = 0;

    // All three ride ONE flush (synchronous before the queued microtask drain).
    m.insert("d", 4);
    m.update("a", (cell) => {
      cell.n = 9;
    });
    m.del("c");
    await tick();

    const ds = deltas(m.h);
    expect(ds).toHaveLength(1);
    expect(m.loaderCalls).toEqual(["a,d"]); // one coalesced refill of the I∪U ids
    expect(m.orderOf()).toBe(1); // d entered → one orderOf
    expect(ds[0]!.order).toEqual(["a", "b", "d"]);
    expect(ds[0]!.deletes).toEqual(["c"]);
    expect((ds[0]!.upserts ?? []).map(([id]) => id).sort()).toEqual(["a", "d"]);

    const cv = makeClientView(keyOf);
    cv.applyAll(m.h.frames);
    expect(cv.value).toEqual([{ id: "a", n: 9 }, { id: "b", n: 1 }, { id: "d", n: 4 }]);
    expect(cv.driftResubs).toBe(0);
  });

  test("a sticky-FULL contributor (id-less bulk change) absorbs a coalesced membership change → FULL recompute", async () => {
    const m = membershipHarness();
    m.table.set("a", { n: 1, where: true });
    m.table.set("b", { n: 1, where: true });
    m.table.set("c", { n: 1, where: true });
    await m.h.subscribe("rows");
    m.loaderCalls.length = 0;

    // A scoped DELETE, then an id-less bulk INSERT in the same flush: the null
    // contributor degrades the pending to FULL, so the whole pk recomputes FULL.
    m.del("b");
    m.feed("I", null); // bulk / over-cap → FULL
    await tick();

    expect(m.loaderCalls).toEqual(["FULL"]); // never a scoped refill
    expect(m.orderOf()).toBe(0); // the FULL path does not call orderOf

    const cv = makeClientView(keyOf);
    cv.applyAll(m.h.frames);
    expect(cv.value).toEqual([{ id: "a", n: 1 }, { id: "c", n: 1 }]);
    expect(cv.driftResubs).toBe(0);
  });
});

describe("scopedMembership — no-op window", () => {
  test("a content-preserving UPDATE ships no frame and bumps no version", async () => {
    const m = membershipHarness();
    m.table.set("a", { n: 1, where: true });
    m.table.set("b", { n: 1, where: true });
    await m.h.subscribe("rows"); // version 0
    m.loaderCalls.length = 0;

    // UPDATE that does not change content: refill returns the identical row → the
    // membership diff is empty → no frame, no version bump.
    m.update("a", () => {});
    await tick();
    expect(deltas(m.h)).toHaveLength(0);

    // A subsequent REAL change is version 1 — proving the no-op left it at 0.
    m.update("a", (cell) => {
      cell.n = 5;
    });
    await tick();
    const ds = deltas(m.h);
    expect(ds).toHaveLength(1);
    expect(ds[0]!.version).toBe(1);
  });
});

describe("scopedMembership — L2 persisted reconstruct-and-persist", () => {
  test("a scoped change reconstructs a FULL-equal value and persists it, watermark captured BEFORE the refill", async () => {
    const log: string[] = [];
    const persistArgs: Array<{ value: unknown; wm: string }> = [];
    const m = membershipHarness(
      {
        shouldPersist: (k) => k === "rows",
        captureWatermark: async () => {
          log.push("wm");
          return "xmin-42";
        },
        persistSnapshot: async (_key, _pk, value, wm) => {
          log.push("persist");
          persistArgs.push({ value, wm });
        },
      },
      log,
    );
    m.table.set("a", { n: 1, where: true });
    m.table.set("b", { n: 1, where: true });
    await m.h.subscribe("rows"); // FULL seed + persist
    log.length = 0;
    persistArgs.length = 0;

    m.update("a", (cell) => {
      cell.n = 5;
    });
    await tick();

    // Watermark BEFORE the (scoped) refill, then persist — and the change took the
    // INCREMENTAL path (load:scoped), not a forced FULL.
    expect(log).toEqual(["wm", "load:scoped", "persist"]);
    expect(persistArgs).toHaveLength(1);
    expect(persistArgs[0]!.wm).toBe("xmin-42");
    // The reconstructed value is byte-identical to a FULL recompute of the members.
    expect(persistArgs[0]!.value).toEqual([{ id: "a", n: 5 }, { id: "b", n: 1 }]);
  });
});

describe("scopedMembership — degrade to FULL with no snapshot, then resume incremental", () => {
  test("a persisted entry's first (pre-snapshot) change FULL-recomputes; the next resumes scoped", async () => {
    const log: string[] = [];
    const m = membershipHarness(
      {
        shouldPersist: (k) => k === "rows",
        captureWatermark: async () => "xmin-1",
        persistSnapshot: async () => {},
      },
      log,
    );
    m.table.set("a", { n: 1, where: true });
    m.table.set("b", { n: 1, where: true });
    // No subscribe: cold boot, no snapshot. A scoped UPDATE arrives.
    m.update("a", (cell) => {
      cell.n = 2;
    });
    await tick();
    // Branch 3: no snapshot → FULL recompute (and it SEEDS the snapshot).
    expect(log).toEqual(["load:FULL"]);

    // The next scoped change now finds a snapshot → incremental.
    log.length = 0;
    m.update("a", (cell) => {
      cell.n = 3;
    });
    await tick();
    expect(log).toEqual(["load:scoped"]);
  });
});

describe("scopedMembership — snapshot survives N→0 for a persisted entry", () => {
  test("after unsubscribe, a persisted sm entry still has its snapshot (next change is scoped, not FULL)", async () => {
    const log: string[] = [];
    const m = membershipHarness(
      {
        shouldPersist: (k) => k === "rows",
        captureWatermark: async () => "xmin-1",
        persistSnapshot: async () => {},
      },
      log,
    );
    m.table.set("a", { n: 1, where: true });
    m.table.set("b", { n: 1, where: true });
    await m.h.subscribe("rows"); // seeds snapshot
    await m.h.unsub("rows"); // N→0 — the snapshot must survive for a persisted sm
    log.length = 0;

    m.update("a", (cell) => {
      cell.n = 9;
    });
    await tick();
    // Scoped (snapshot survived); a FULL here would mean the snapshot was evicted.
    expect(log).toEqual(["load:scoped"]);
  });

  test("a NON-persisted sm entry evicts its snapshot on N→0 (contrast)", async () => {
    // Non-persisted + zero subs after unsub ⇒ needValue is false, so no loader runs
    // at all (branch 3 with nothing to seed). The absence of a scoped load proves
    // the snapshot was evicted — the guard is bounded to persisted entries.
    const m = membershipHarness();
    m.table.set("a", { n: 1, where: true });
    await m.h.subscribe("rows");
    await m.h.unsub("rows");
    m.loaderCalls.length = 0;

    m.update("a", (cell) => {
      cell.n = 9;
    });
    await tick();
    expect(m.loaderCalls).toEqual([]); // no scoped refill against a live snapshot
  });
});

describe("scopedMembership — downstream cascade", () => {
  // `up` is a scopedMembership resource; `down` is a plain keyed resource that
  // cascades off it via an identity `affectedMap`, recording how each cascaded
  // load was scoped. A DELETE from `up` forces `down` FULL (a vanished row has no
  // value to translate); an INSERT cascades scoped.
  function cascadeHarness() {
    const up = makeTable();
    const h = createHarness({ readSet: (k) => (k === "up" ? ["up_t"] : ["down_t"]) });
    const upResource = h.runtime.defineResource(
      { key: "up", schema: rowsSchema, keyed: { keyOf } },
      {
        identityTable: "up_t",
        scopedMembership: { orderOf: async () => up.orderIds() },
        loader: (_p, c) =>
          c === undefined
            ? up.members()
            : c.affectedIds.filter((id) => up.table.get(id)?.where).map((id) => ({ id, n: up.table.get(id)!.n })),
      },
    );
    const downLoads: string[] = [];
    h.runtime.defineResource(
      { key: "down", schema: rowsSchema, keyed: { keyOf } },
      {
        identityTable: "down_t",
        dependsOn: [{ resource: upResource, affectedMap: (ids) => [...ids] }],
        loader: (_p, c) => {
          downLoads.push(c === undefined ? "FULL" : "scoped");
          return [{ id: "d", n: 1 }];
        },
      },
    );
    const feedUp = (op: "I" | "U" | "D", ids: string[] | null) =>
      h.runtime.applyDbChange({ table: "up_t", op, ids, origin: "up_t", identityBase: "up_t" });
    return { h, up, downLoads, feedUp };
  }

  test("INSERT into up cascades scoped; DELETE from up cascades FULL", async () => {
    const c = cascadeHarness();
    c.up.table.set("a", { n: 1, where: true });
    await c.h.subscribe("up");
    await c.h.subscribe("down");
    c.downLoads.length = 0;

    // INSERT a new member → up scopes to {x} → down cascades scoped.
    c.up.table.set("x", { n: 1, where: true });
    c.feedUp("I", ["x"]);
    await tick();
    expect(c.downLoads).toEqual(["scoped"]);

    // DELETE it → up's deleted set forces a FULL downstream cascade.
    c.downLoads.length = 0;
    c.up.table.delete("x");
    c.feedUp("D", ["x"]);
    await tick();
    expect(c.downLoads).toEqual(["FULL"]);
  });
});

describe("default-off — a keyed resource without scopedMembership is byte-identical to pre-M5", () => {
  test("INSERT → FULL, UPDATE → scoped, DELETE → FULL (unchanged legacy routing)", async () => {
    const { table, members } = makeTable();
    const loaderCalls: string[] = [];
    const h = createHarness({ readSet: () => ["row_table"] });
    h.runtime.defineResource(
      { key: "rows", schema: rowsSchema, keyed: { keyOf } },
      {
        identityTable: "row_table", // scoped, but NOT scopedMembership
        loader: (_p, c) => {
          if (c === undefined) {
            loaderCalls.push("FULL");
            return members();
          }
          loaderCalls.push([...c.affectedIds].sort().join(","));
          return c.affectedIds
            .filter((id) => table.get(id)?.where)
            .map((id) => ({ id, n: table.get(id)!.n }));
        },
      },
    );
    table.set("a", { n: 1, where: true });
    table.set("b", { n: 1, where: true });
    await h.subscribe("rows");
    loaderCalls.length = 0;

    const feed = (op: "I" | "U" | "D", ids: string[]) =>
      h.runtime.applyDbChange({ table: "row_table", op, ids, origin: "row_table", identityBase: "row_table" });

    table.set("x", { n: 1, where: true });
    feed("I", ["x"]);
    await tick();
    table.get("a")!.n = 9;
    feed("U", ["a"]);
    await tick();
    table.delete("x");
    feed("D", ["x"]);
    await tick();

    // Pre-M5 behavior: INSERT and DELETE degrade to FULL; only UPDATE scopes.
    expect(loaderCalls).toEqual(["FULL", "a", "FULL"]);
  });
});

describe("scopedMembership — registration guards", () => {
  test("throws when scopedMembership is set without keyed mode", () => {
    const h = createHarness();
    expect(() =>
      h.runtime.defineResource({
        key: "bad",
        mode: "push",
        schema: z.number(),
        identityTable: "t",
        // @ts-expect-error — scopedMembership is not on the non-keyed input form
        scopedMembership: { orderOf: async () => [] },
        loader: async () => 1,
      }),
    ).toThrow(/scopedMembership requires mode "keyed"/);
  });

  test("throws when scopedMembership is set without an identityTable", () => {
    const h = createHarness();
    expect(() =>
      h.runtime.defineResource(
        { key: "bad2", schema: rowsSchema, keyed: { keyOf } },
        {
          // no identityTable → the ScopePolicy would be violated anyway; the runtime
          // fails loudly rather than silently disabling membership scoping.
          recompute: { kind: "full", reason: "test" },
          scopedMembership: { orderOf: async () => [] },
          loader: async () => [],
        },
      ),
    ).toThrow(/scopedMembership requires an identityTable/);
  });
});

// Frame drift is asserted per-scenario above via makeClientView; this final guard
// keeps the RecordedFrame import honest and documents the shape a membership delta
// takes on the wire (upserts + deletes + order + version).
test("a membership delta carries upserts, deletes, order and a version", async () => {
  const m = membershipHarness();
  m.table.set("a", { n: 1, where: true });
  await m.h.subscribe("rows");
  m.insert("b", 2);
  await tick();
  const frame = deltas(m.h)[0] as RecordedFrame;
  expect(frame.kind).toBe("delta");
  expect(frame.version).toBe(1);
  expect(frame.order).toEqual(["a", "b"]);
  expect(frame.upserts).toEqual([["b", { id: "b", n: 2 }]]);
  expect(frame.deletes).toEqual([]);
});
