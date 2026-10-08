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
 *   - a PERSISTED entry floor-persists a FULL-equal value, once per trailing
 *     window, floored by the snapshot's base (never a drain-time capture);
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
import {
  createHarness,
  tick,
  makeClientView,
  type RecordedFrame,
} from "./test-support";

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
function membershipHarness(
  runtimeOpts: Parameters<typeof createHarness>[0] = {},
  log?: string[],
) {
  const { table, members, orderIds } = makeTable();
  const loaderCalls: string[] = [];
  let orderOfCalls = 0;
  const h = createHarness({ readSet: () => ["row_table"], ...runtimeOpts });
  h.runtime.defineResource(
    {
      key: "rows",
      schema: rowsSchema,
      keyed: { keyOf },
      validateParams: () => {},
    },
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
    h.runtime.applyDbChange({
      source: "feed",
      table: "row_table",
      op,
      ids,
      origin: "row_table",
      identityBase: "row_table",
    });
  const insert = (id: string, n: number, where = true) => {
    table.set(id, { n, where });
    feed("I", [id]);
  };
  const update = (
    id: string,
    mut: (c: { n: number; where: boolean }) => void,
  ) => {
    mut(table.get(id)!);
    feed("U", [id]);
  };
  const del = (id: string) => {
    table.delete(id);
    feed("D", [id]);
  };
  return {
    h,
    table,
    members,
    loaderCalls,
    orderOf: () => orderOfCalls,
    feed,
    insert,
    update,
    del,
  };
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
    expect(cv.value).toEqual([
      { id: "a", n: 1 },
      { id: "c", n: 1 },
    ]);
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
    expect(cv.value).toEqual([
      { id: "a", n: 1 },
      { id: "b", n: 7 },
      { id: "c", n: 1 },
    ]);
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
    expect(cv.value).toEqual([
      { id: "a", n: 9 },
      { id: "b", n: 1 },
      { id: "d", n: 4 },
    ]);
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
    expect(cv.value).toEqual([
      { id: "a", n: 1 },
      { id: "c", n: 1 },
    ]);
    expect(cv.driftResubs).toBe(0);
  });
});

describe("scopedMembership — no-op window", () => {
  test("a content-preserving UPDATE ships no frame and bumps no version", async () => {
    const m = membershipHarness();
    m.table.set("a", { n: 1, where: true });
    m.table.set("b", { n: 1, where: true });
    await m.h.subscribe("rows");
    const base = m.h.frames.find((f) => f.kind === "sub-ack")!.version!;
    m.loaderCalls.length = 0;

    // UPDATE that does not change content: refill returns the identical row → the
    // membership diff is empty → no frame, no version bump.
    m.update("a", () => {});
    await tick();
    expect(deltas(m.h)).toHaveLength(0);

    // A subsequent REAL change is the sub-ack's version + 1 — proving the no-op
    // left the counter where the sub-ack found it.
    m.update("a", (cell) => {
      cell.n = 5;
    });
    await tick();
    const ds = deltas(m.h);
    expect(ds).toHaveLength(1);
    expect(ds[0]!.version).toBe(base + 1);
  });
});

describe("scopedMembership — L2 persisted floor persist", () => {
  // The harness of the cases below: a persisted alias whose persists are
  // recorded (with their mode), the trailing window at 0 ms.
  function persistedHarness(log: string[], wm = "xmin-42", windowMs = 0) {
    const persistArgs: Array<{
      value: unknown;
      wm: string;
      mode: string;
      guard: readonly string[];
    }> = [];
    let wmTag = wm;
    const m = membershipHarness(
      {
        shouldPersist: (k) => k === "rows",
        persistWindowMs: windowMs,
        captureWatermark: async () => {
          log.push("wm");
          return wmTag;
        },
        persistSnapshot: async (_key, _pk, value, w, meta) => {
          log.push(`persist:${meta.mode}`);
          persistArgs.push({
            value,
            wm: w,
            mode: meta.mode,
            guard: meta.guardTables,
          });
        },
      },
      log,
    );
    return {
      m,
      persistArgs,
      setWm: (w: string) => {
        wmTag = w;
      },
    };
  }

  test("a scoped change floor-persists a FULL-equal value, floored by the snapshot's BASE — no capture at the drain", async () => {
    const log: string[] = [];
    const { m, persistArgs, setWm } = persistedHarness(log);
    m.table.set("a", { n: 1, where: true });
    m.table.set("b", { n: 1, where: true });
    await m.h.subscribe("rows"); // FULL seed (base floor xmin-42)
    await tick();
    log.length = 0;
    persistArgs.length = 0;
    // A later capture would describe a newer read — it must NOT floor the value.
    setWm("xmin-99");

    m.update("a", (cell) => {
      cell.n = 5;
    });
    await tick();
    await tick();

    // No watermark is captured on the scoped path; the INCREMENTAL refill runs,
    // then ONE floor persist.
    expect(log).toEqual(["load:scoped", "persist:floor"]);
    expect(persistArgs).toHaveLength(1);
    expect(persistArgs[0]!.wm).toBe("xmin-42");
    expect(persistArgs[0]!.mode).toBe("floor");
    // The guard tables are the key's read-set union (no routes).
    expect(persistArgs[0]!.guard).toEqual(["row_table"]);
    // The reconstructed value is byte-identical to a FULL recompute of the members.
    expect(persistArgs[0]!.value).toEqual([
      { id: "a", n: 5 },
      { id: "b", n: 1 },
    ]);
  });

  test("a burst of scoped changes inside one window costs ONE floor persist of the latest value", async () => {
    const log: string[] = [];
    const { m, persistArgs } = persistedHarness(log, "xmin-42", 30);
    m.table.set("a", { n: 1, where: true });
    m.table.set("b", { n: 1, where: true });
    await m.h.subscribe("rows");
    await tick();
    persistArgs.length = 0;
    // Three changes, each drained on its own flush, all inside the 30 ms window.
    m.update("a", (cell) => {
      cell.n = 2;
    });
    await tick();
    m.insert("c", 3);
    await tick();
    m.del("b");
    await tick();
    expect(persistArgs).toEqual([]); // the window has not fired yet
    await new Promise((r) => setTimeout(r, 60));
    expect(persistArgs).toHaveLength(1);
    expect(persistArgs[0]!.mode).toBe("floor");
    expect(persistArgs[0]!.wm).toBe("xmin-42");
    expect(persistArgs[0]!.value).toEqual(m.members());

    // The window is fixed, not a debounce: a second burst after it fired
    // arms a fresh one and costs exactly one more persist.
    m.update("a", (cell) => {
      cell.n = 4;
    });
    await tick();
    m.insert("d", 5);
    await tick();
    expect(persistArgs).toHaveLength(1);
    await new Promise((r) => setTimeout(r, 60));
    expect(persistArgs).toHaveLength(2);
    expect(persistArgs[1]!.mode).toBe("floor");
    expect(persistArgs[1]!.value).toEqual(m.members());
  });

  test("a floor window elapsing while a replace is in flight writes no pre-replace value over it", async () => {
    // The FULL drain awaits its replace BEFORE it rebuilds the snapshot, so a
    // window left armed would fire mid-write, chain a floor link behind the
    // replace, and write the OLD snapshot (at the OLD base floor) over it.
    const persisted: Array<{ value: unknown; mode: string }> = [];
    let blockReplace = false;
    let release: (() => void) | undefined;
    const m = membershipHarness({
      shouldPersist: (k) => k === "rows",
      persistWindowMs: 20,
      captureWatermark: async () => "xmin-1",
      persistSnapshot: async (_k, _pk, value, _w, meta) => {
        if (meta.mode === "replace" && blockReplace) {
          await new Promise<void>((r) => {
            release = r;
          });
        }
        persisted.push({ value, mode: meta.mode });
      },
    });
    m.table.set("a", { n: 1, where: true });
    await m.h.subscribe("rows");
    await tick();
    persisted.length = 0;
    // A scoped change arms the 20 ms window …
    m.update("a", (cell) => {
      cell.n = 2;
    });
    await tick();
    // … then a FULL recompute (of a value the snapshot does not hold yet)
    // whose replace stalls well past the window.
    blockReplace = true;
    m.table.get("a")!.n = 3;
    m.h.runtime.recomputeResource("rows");
    await tick();
    expect(release).toBeDefined();
    await new Promise((r) => setTimeout(r, 50));
    release!();
    await tick();
    await new Promise((r) => setTimeout(r, 40));
    expect(persisted).toEqual([
      { value: [{ id: "a", n: 3 }], mode: "replace" },
    ]);
  });

  test("a sub-ack seed under a scoped drain never leaves the base floor above the snapshot it wrote", async () => {
    // The drain writes `prev` + its refill over the sub-ack's seed, so the base
    // floor must stay `prev`'s — the sub-ack's newer watermark would claim
    // commits the written value never read.
    const persisted: Array<{ value: unknown; wm: string; mode: string }> = [];
    let wm = "xmin-1";
    const table = new Map<string, number>([
      ["a", 1],
      ["b", 1],
    ]);
    const full = () =>
      [...table.entries()]
        .map(([id, n]) => ({ id, n }))
        .sort((x, y) => (x.id < y.id ? -1 : 1));
    let gate: (() => void) | undefined;
    const h = createHarness({
      sockets: 2,
      readSet: () => ["row_table"],
      shouldPersist: (k) => k === "rows",
      persistWindowMs: 0,
      captureWatermark: async () => wm,
      persistSnapshot: async (_k, _pk, value, w, meta) => {
        persisted.push({ value, wm: w, mode: meta.mode });
      },
    });
    h.runtime.defineResource(
      {
        key: "rows",
        schema: rowsSchema,
        keyed: { keyOf },
        validateParams: () => {},
      },
      {
        identityTable: "row_table",
        scopedMembership: { orderOf: async () => full().map((r) => r.id) },
        loader: async (_p, c) => {
          if (!c) return full();
          await new Promise<void>((r) => {
            gate = r;
          });
          return c.affectedIds
            .filter((id) => table.has(id))
            .map((id) => ({ id, n: table.get(id)! }));
        },
      },
    );
    await h.subscribe("rows"); // base floor xmin-1
    await tick();
    persisted.length = 0;
    wm = "xmin-5";
    table.set("a", 2);
    h.runtime.applyDbChange({
      source: "feed",
      table: "row_table",
      op: "U",
      ids: ["a"],
      origin: "row_table",
      identityBase: "row_table",
    });
    await tick(); // the drain is parked in its scoped refill
    expect(gate).toBeDefined();
    // A second subscriber's sub-ack re-seeds the snapshot at xmin-5 meanwhile.
    await h.subscribe("rows", {}, { socket: 1 });
    gate!();
    await tick();
    await tick();
    const floors = persisted.filter((p) => p.mode === "floor");
    expect(floors).toHaveLength(1);
    expect(floors[0]!.wm).toBe("xmin-1");
    expect(floors[0]!.value).toEqual(full());
  });

  test("a reorder-then-floor value equals the FULL output (alias orderSignatureOf)", async () => {
    // An alias that declares `orderSignatureOf` re-derives its order when a
    // member's ORDER BY projection moves, so the floor-persisted value is the
    // FULL loader's — not the stale position.
    const log: string[] = [];
    const persisted: Array<{ value: unknown; mode: string }> = [];
    const table = new Map<string, number>([
      ["a", 1],
      ["b", 2],
      ["c", 3],
    ]);
    const full = () =>
      [...table.entries()]
        .map(([id, n]) => ({ id, n }))
        .sort((x, y) => x.n - y.n || (x.id < y.id ? -1 : 1));
    let orderOfCalls = 0;
    const h = createHarness({
      readSet: () => ["row_table"],
      shouldPersist: (k) => k === "rows",
      persistWindowMs: 0,
      captureWatermark: async () => "xmin-1",
      persistSnapshot: async (_k, _pk, value, _w, meta) => {
        persisted.push({ value, mode: meta.mode });
      },
    });
    h.runtime.defineResource(
      {
        key: "rows",
        schema: rowsSchema,
        keyed: { keyOf },
        validateParams: () => {},
      },
      {
        identityTable: "row_table",
        scopedMembership: {
          orderOf: async () => {
            orderOfCalls++;
            return full().map((r) => r.id);
          },
          orderSignatureOf: (row) => String((row as { n: number }).n),
        },
        loader: (_p, c) => {
          log.push(c ? "scoped" : "FULL");
          if (!c) return full();
          return c.affectedIds
            .filter((id) => table.has(id))
            .map((id) => ({ id, n: table.get(id)! }));
        },
      },
    );
    await h.subscribe("rows");
    await tick();
    persisted.length = 0;
    // Move "a" to the end: an in-place UPDATE of the order column.
    table.set("a", 9);
    h.runtime.applyDbChange({
      source: "feed",
      table: "row_table",
      op: "U",
      ids: ["a"],
      origin: "row_table",
      identityBase: "row_table",
    });
    await tick();
    await tick();
    expect(orderOfCalls).toBe(1); // the moved signature re-derived the order
    expect(persisted.at(-1)).toEqual({ value: full(), mode: "floor" });
    const cv = makeClientView(keyOf);
    cv.applyAll(h.frames);
    expect(cv.value).toEqual(full());
  });

  test("a successful replace cancels an armed floor window", async () => {
    const log: string[] = [];
    const m = membershipHarness(
      {
        shouldPersist: (k) => k === "rows",
        persistWindowMs: 30,
        captureWatermark: async () => "xmin-1",
        persistSnapshot: async (_k, _pk, _v, _w, meta) => {
          log.push(`persist:${meta.mode}`);
        },
      },
      log,
    );
    m.table.set("a", { n: 1, where: true });
    await m.h.subscribe("rows");
    await tick();
    log.length = 0;
    // A scoped change arms the 30 ms window …
    m.update("a", (cell) => {
      cell.n = 2;
    });
    await tick();
    expect(log).toEqual(["load:scoped"]);
    // … and a FULL recompute replaces the row before it fires, cancelling it.
    m.h.runtime.recomputeResource("rows");
    await tick();
    await new Promise((r) => setTimeout(r, 60));
    expect(log.filter((l) => l.startsWith("persist"))).toEqual([
      "persist:replace",
    ]);
  });

  test("dropPendingPersists drops an armed window without writing it", async () => {
    const log: string[] = [];
    const persistArgs: unknown[] = [];
    const m = membershipHarness(
      {
        shouldPersist: (k) => k === "rows",
        persistWindowMs: 50,
        captureWatermark: async () => "xmin-1",
        persistSnapshot: async (_k, _pk, value) => {
          persistArgs.push(value);
        },
      },
      log,
    );
    m.table.set("a", { n: 1, where: true });
    await m.h.subscribe("rows");
    await tick();
    persistArgs.length = 0;
    m.update("a", (cell) => {
      cell.n = 2;
    });
    await tick(); // drained: the window is armed
    expect(m.h.runtime.dropPendingPersists()).toBe(1);
    await new Promise((r) => setTimeout(r, 80));
    expect(persistArgs).toEqual([]);
  });

  test("keptSnapshotValue serves the alias's current in-memory value", async () => {
    const log: string[] = [];
    const { m } = persistedHarness(log);
    expect(m.h.runtime.keptSnapshotValue("rows")).toBeUndefined(); // no snapshot yet
    m.table.set("a", { n: 1, where: true });
    await m.h.subscribe("rows");
    await m.h.unsub("rows"); // kept across N→0
    m.update("a", (cell) => {
      cell.n = 7;
    });
    await tick();
    expect(m.h.runtime.keptSnapshotValue("rows")).toEqual([{ id: "a", n: 7 }]);
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

describe("scopedMembership — L2 boot seed skips the first-change FULL", () => {
  test("after seedPersistedSnapshot, the FIRST change resumes scoped (no FULL rebuild)", async () => {
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
    // No subscribe (cold boot, no live snapshot) — BUT the L2 boot seed restores
    // the in-memory diff base from the durable value, exactly as onReady does before
    // catch-up. This is the ONLY difference from the "degrade to FULL" test above,
    // which does not seed and therefore FULL-recomputes its first change.
    expect(
      m.h.runtime.seedPersistedSnapshot(
        "rows",
        "{}",
        [
          { id: "a", n: 1 },
          { id: "b", n: 1 },
        ],
        { position: "1", positionAt: null },
      ),
    ).toEqual({ kind: "seeded" });

    // The very first scoped change now finds the seeded snapshot → incremental.
    m.update("a", (cell) => {
      cell.n = 2;
    });
    await tick();
    expect(log).toEqual(["load:scoped"]); // NOT ["load:FULL"] — the seed did its job
  });

  test("seedPersistedSnapshot never clobbers an existing (fresher) snapshot", async () => {
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
    await m.h.subscribe("rows"); // seeds a live snapshot [a,b]
    log.length = 0;

    // A late seed with a STALE value must be a no-op (snapshot already present), so
    // the next change still diffs against the fresh base and stays scoped/correct.
    expect(
      m.h.runtime.seedPersistedSnapshot("rows", "{}", [{ id: "a", n: 999 }], {
        position: "1",
        positionAt: null,
      }),
    ).toEqual({ kind: "skipped" });
    m.update("a", (cell) => {
      cell.n = 5;
    });
    await tick();
    expect(log).toEqual(["load:scoped"]);
    const cv = makeClientView(keyOf);
    cv.applyAll(m.h.frames);
    expect(cv.value).toEqual([
      { id: "a", n: 5 },
      { id: "b", n: 1 },
    ]);
    expect(cv.driftResubs).toBe(0);
  });
});

describe("scopedMembership — A30: an L2 value that does not parse seeds nothing", () => {
  test("a value the payload schema rejects is `invalid`: no snapshot, so the first change rebuilds FULL", async () => {
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
    // A row schema moved under the L2 row (an opaque transform's body the
    // definition does not fingerprint): `n` is no longer a number.
    const outcome = m.h.runtime.seedPersistedSnapshot(
      "rows",
      "{}",
      [{ id: "a", n: "one" }],
      { position: "1", positionAt: null },
    );
    expect(outcome.kind).toBe("invalid");
    expect(m.h.runtime.keptSnapshotValue("rows")).toBeUndefined();
    // Nothing was seeded: the first change cannot diff against a base.
    m.update("a", (cell) => {
      cell.n = 2;
    });
    await tick();
    expect(log).toEqual(["load:FULL"]);
    expect(m.h.runtime.keptSnapshotValue("rows")).toEqual([{ id: "a", n: 2 }]);
  });

  test("an unknown key, or a key that is no unbounded-window alias, is `skipped`", () => {
    const m = membershipHarness({}, []);
    // A registered keyed entry WITHOUT scopedMembership: no alias, never
    // seeded — and never parsed, so even a value its schema rejects skips.
    m.h.runtime.defineResource(
      {
        key: "plain",
        schema: rowsSchema,
        keyed: { keyOf },
        validateParams: () => {},
      },
      {
        identityTable: "row_table",
        fanOut: { reason: "one param-less tuple — nothing to narrow" },
        loader: () => [],
      },
    );
    const base = { position: "1", positionAt: null };
    for (const key of ["nope", "plain"]) {
      expect(m.h.runtime.seedPersistedSnapshot(key, "{}", [], base)).toEqual({
        kind: "skipped",
      });
      expect(
        m.h.runtime.seedPersistedSnapshot(key, "{}", { not: "rows" }, base),
      ).toEqual({ kind: "skipped" });
      expect(m.h.runtime.validatePersistedValue(key, { not: "rows" })).toEqual({
        kind: "skipped",
      });
    }
  });

  test("a tuple that already holds a fresher snapshot is `skipped` before any parse — an invalid late value leaves it untouched", async () => {
    const m = membershipHarness({
      shouldPersist: (k) => k === "rows",
      captureWatermark: async () => "xmin-1",
      persistSnapshot: async () => {},
    });
    m.table.set("a", { n: 1, where: true });
    await m.h.subscribe("rows"); // seeds the `{}` snapshot
    const before = m.h.runtime.keptSnapshotValue("rows");
    expect(before).toEqual([{ id: "a", n: 1 }]);
    // Skipped, not invalid: the snapshot-present check runs first, so the
    // caller (`runBootCatchUp`) lowers the replay floor rather than clearing
    // the row a fresher base already stands in front of.
    expect(
      m.h.runtime.seedPersistedSnapshot("rows", "{}", [{ id: "a", n: "one" }], {
        position: "1",
        positionAt: null,
      }),
    ).toEqual({ kind: "skipped" });
    expect(m.h.runtime.keptSnapshotValue("rows")).toEqual(before);
  });

  test("validatePersistedValue is A30's parse alone: valid / invalid, seeding nothing", () => {
    const m = membershipHarness({
      shouldPersist: (k) => k === "rows",
      captureWatermark: async () => "xmin-1",
      persistSnapshot: async () => {},
    });
    expect(
      m.h.runtime.validatePersistedValue("rows", [{ id: "a", n: 1 }]),
    ).toEqual({ kind: "valid" });
    expect(
      m.h.runtime.validatePersistedValue("rows", [{ id: "a", n: "one" }]).kind,
    ).toBe("invalid");
    expect(m.h.runtime.keptSnapshotValue("rows")).toBeUndefined();
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
    const h = createHarness({
      readSet: (k) => (k === "up" ? ["up_t"] : ["down_t"]),
    });
    const upResource = h.runtime.defineResource(
      {
        key: "up",
        schema: rowsSchema,
        keyed: { keyOf },
        validateParams: () => {},
      },
      {
        identityTable: "up_t",
        scopedMembership: { orderOf: async () => up.orderIds() },
        loader: (_p, c) =>
          c === undefined
            ? up.members()
            : c.affectedIds
                .filter((id) => up.table.get(id)?.where)
                .map((id) => ({ id, n: up.table.get(id)!.n })),
      },
    );
    const downLoads: string[] = [];
    h.runtime.defineResource(
      {
        key: "down",
        schema: rowsSchema,
        keyed: { keyOf },
        validateParams: () => {},
      },
      {
        identityTable: "down_t",
        fanOut: { reason: "one param-less tuple — nothing to narrow" },
        dependsOn: [{ resource: upResource, affectedMap: (ids) => [...ids] }],
        loader: (_p, c) => {
          downLoads.push(c === undefined ? "FULL" : "scoped");
          return [{ id: "d", n: 1 }];
        },
      },
    );
    const feedUp = (op: "I" | "U" | "D", ids: string[] | null) =>
      h.runtime.applyDbChange({
        source: "feed",
        table: "up_t",
        op,
        ids,
        origin: "up_t",
        identityBase: "up_t",
      });
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
      {
        key: "rows",
        schema: rowsSchema,
        keyed: { keyOf },
        validateParams: () => {},
      },
      {
        identityTable: "row_table", // scoped, but NOT scopedMembership
        fanOut: { reason: "one param-less tuple — nothing to narrow" },
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
      h.runtime.applyDbChange({
        source: "feed",
        table: "row_table",
        op,
        ids,
        origin: "row_table",
        identityBase: "row_table",
      });

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
      // The four-arm `ScopePolicy` rejects this combination at compile time, which
      // is the point: `@ts-expect-error` FAILS if it ever stops being rejected, so
      // the directive pins the type's behaviour as a test. The runtime guard below
      // is the backstop for a caller who casts past the type.
      // @ts-expect-error — `recompute` and `scopedMembership` are different arms
      h.runtime.defineResource(
        {
          key: "bad2",
          schema: rowsSchema,
          keyed: { keyOf },
          validateParams: () => {},
        },
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
  const ack = m.h.frames.find((f) => f.kind === "sub-ack")!;
  m.insert("b", 2);
  await tick();
  const frame = deltas(m.h)[0] as RecordedFrame;
  expect(frame.kind).toBe("delta");
  expect(frame.version).toBe(ack.version! + 1); // the first change after the sub-ack
  expect(frame.order).toEqual(["a", "b"]);
  expect(frame.upserts).toEqual([["b", { id: "b", n: 2 }]]);
  expect(frame.deletes).toEqual([]);
});
