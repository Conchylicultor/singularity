/**
 * Bounded `membership` (window / point) — the generalization of M5
 * `scopedMembership` from
 * `research/2026-07-18-global-bounded-working-set-resource-contract.md`. Run with
 * `bun test plugins/framework/plugins/resource-runtime/core/runtime-window-membership.test.ts`.
 *
 * A `membership: { kind: "window", windowIdsOf }` entry's value is a bounded
 * ordered window; a `membership: { kind: "point", idsOf }` entry's value is the
 * params tuple's explicit id set. Both keep the wire, versions, and diff of M5 —
 * a membership change costs O(changed) + O(window), never O(collection). Pinned
 * here:
 *
 *   - entrant into the window → one scoped refill + one windowIdsOf, delta with
 *     bounded `order`; an entrant sorting PAST THE TAIL ships nothing (one
 *     windowIdsOf probe, no frame, no version bump);
 *   - leaver (DELETE / where-flip exit) → windowIdsOf + tail backfill: the new
 *     tail row is pulled in as an upsert alongside the delete;
 *   - squeeze-out: an entrant displacing the tail drops it via `order` alone;
 *   - DELETE of an id outside the snapshot → total no-op (no query, no frame);
 *   - pure in-place UPDATE → upsert only, NO windowIdsOf (the M5 cost model);
 *   - point routing: a change reaches a subscribed tuple iff its ids intersect;
 *     upsert / delete / entrant-append all per tuple; foreign ids ship nothing;
 *   - bounded entries are EXCLUDED from persistence even when `shouldPersist`
 *     says yes, and their snapshot evicts on N→0 (contrast: the alias persists);
 *   - the evicted-snapshot self-heal ships a FULL update built from the entry's
 *     own (bounded) loader;
 *   - registration guards: membership XOR scopedMembership, keyed + identityTable
 *     required.
 *
 * The `scopedMembership` alias's byte-identical behavior is pinned by
 * `runtime-scoped-membership.test.ts` (kept green unchanged — that suite IS the
 * alias-equivalence proof, since the alias now routes through this same
 * membership machinery as an unbounded window).
 */

import { test, expect, describe } from "bun:test";
import { z } from "zod";
import { createHarness, tick, makeClientView } from "./test-support";

const rowsSchema = z.array(z.object({ id: z.string(), n: z.number() }));
const keyOf = (r: unknown) => (r as { id: string }).id;

// A simulated identity table whose total order is ascending `n` (then id). The
// window is the first `limit` members — `windowIdsOf` carries the LIMIT, exactly
// like a compiled `SELECT pk … ORDER BY … LIMIT n`.
function makeTable() {
  const table = new Map<string, { n: number; where: boolean }>();
  const members = (): { id: string; n: number }[] =>
    [...table.entries()]
      .filter(([, c]) => c.where)
      .map(([id, c]) => ({ id, n: c.n }))
      .sort((a, b) => a.n - b.n || (a.id < b.id ? -1 : 1));
  return { table, members };
}

// A bounded-window resource "win" over the simulated table: FULL loader = the
// window rows (bounded by construction), scoped loader = the requested member
// rows, windowIdsOf = the first `limit` member ids. Records loader scoping and
// counts windowIdsOf runs.
function windowHarness(limit: number, runtimeOpts: Parameters<typeof createHarness>[0] = {}) {
  const { table, members } = makeTable();
  const loaderCalls: string[] = [];
  let windowIdsOfCalls = 0;
  const h = createHarness({ readSet: () => ["row_table"], ...runtimeOpts });
  h.runtime.defineResource(
    { key: "win", schema: rowsSchema, keyed: { keyOf } },
    {
      identityTable: "row_table",
      membership: {
        kind: "window",
        windowIdsOf: async () => {
          windowIdsOfCalls++;
          return members()
            .slice(0, limit)
            .map((r) => r.id);
        },
      },
      loader: (_p, c) => {
        if (c === undefined) {
          loaderCalls.push("FULL");
          return members().slice(0, limit);
        }
        loaderCalls.push([...c.affectedIds].sort().join(","));
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
  return { h, table, members, loaderCalls, windowIdsOf: () => windowIdsOfCalls, feed, insert, update, del };
}

const deltas = (h: ReturnType<typeof createHarness>, key = "win") =>
  h.pushesFor(key).filter((f) => f.kind === "delta");

describe("window membership — entrant", () => {
  test("an INSERT sorting into the window ships one refill + one windowIdsOf + a bounded order", async () => {
    const w = windowHarness(3);
    w.table.set("a", { n: 1, where: true });
    w.table.set("c", { n: 3, where: true });
    await w.h.subscribe("win"); // window [a,c]
    w.loaderCalls.length = 0;

    w.insert("b", 2);
    await tick();

    expect(w.loaderCalls).toEqual(["b"]); // one scoped refill of just the entrant
    expect(w.windowIdsOf()).toBe(1);
    const ds = deltas(w.h);
    expect(ds).toHaveLength(1);
    expect(ds[0]!.upserts).toEqual([["b", { id: "b", n: 2 }]]);
    expect(ds[0]!.deletes).toEqual([]);
    expect(ds[0]!.order).toEqual(["a", "b", "c"]);

    const cv = makeClientView(keyOf);
    cv.applyAll(w.h.frames);
    expect(cv.value).toEqual([{ id: "a", n: 1 }, { id: "b", n: 2 }, { id: "c", n: 3 }]);
    expect(cv.driftResubs).toBe(0);
  });

  test("an INSERT sorting past the tail of a FULL window ships NOTHING (one windowIdsOf probe, no frame, no version bump)", async () => {
    const w = windowHarness(2);
    w.table.set("a", { n: 1, where: true });
    w.table.set("b", { n: 2, where: true });
    await w.h.subscribe("win"); // window full: [a,b]
    w.loaderCalls.length = 0;

    w.insert("z", 99); // beyond the tail — not a member of this window
    await tick();

    // The refill + windowIdsOf probe ran (the v1 entrant arbiter — O(window),
    // bounded), but no frame shipped and the version did not move.
    expect(w.loaderCalls).toEqual(["z"]);
    expect(w.windowIdsOf()).toBe(1);
    expect(deltas(w.h)).toHaveLength(0);

    // A subsequent REAL change is version 1 — the no-op left the counter at 0.
    w.update("a", (c) => {
      c.n = 0;
    });
    await tick();
    const ds = deltas(w.h);
    expect(ds).toHaveLength(1);
    expect(ds[0]!.version).toBe(1);
  });

  test("squeeze-out: an entrant displacing the tail drops it via order alone", async () => {
    const w = windowHarness(2);
    w.table.set("b", { n: 2, where: true });
    w.table.set("c", { n: 3, where: true });
    await w.h.subscribe("win"); // window [b,c]
    w.loaderCalls.length = 0;

    w.insert("a", 1); // sorts first → c is squeezed out of the window
    await tick();

    const ds = deltas(w.h);
    expect(ds).toHaveLength(1);
    expect(ds[0]!.order).toEqual(["a", "b"]);
    expect((ds[0]!.upserts ?? []).map(([id]) => id)).toEqual(["a"]);

    const cv = makeClientView(keyOf);
    cv.applyAll(w.h.frames);
    expect(cv.value).toEqual([{ id: "a", n: 1 }, { id: "b", n: 2 }]); // c gone
    expect(cv.driftResubs).toBe(0);
  });
});

describe("window membership — leaver + tail backfill", () => {
  test("a DELETE of a member pulls the new tail row in (delete + backfill upsert + bounded order)", async () => {
    const w = windowHarness(2);
    w.table.set("a", { n: 1, where: true });
    w.table.set("b", { n: 2, where: true });
    w.table.set("d", { n: 4, where: true }); // outside the window (limit 2)
    await w.h.subscribe("win"); // window [a,b]
    w.loaderCalls.length = 0;

    w.del("b");
    await tick();

    // One windowIdsOf (the new window [a,d]) + one backfill refill of the
    // pulled-in tail id `d` — never a FULL collection read.
    expect(w.windowIdsOf()).toBe(1);
    expect(w.loaderCalls).toEqual(["d"]);
    const ds = deltas(w.h);
    expect(ds).toHaveLength(1);
    expect(ds[0]!.deletes).toEqual(["b"]);
    expect(ds[0]!.upserts).toEqual([["d", { id: "d", n: 4 }]]);
    expect(ds[0]!.order).toEqual(["a", "d"]);

    const cv = makeClientView(keyOf);
    cv.applyAll(w.h.frames);
    expect(cv.value).toEqual([{ id: "a", n: 1 }, { id: "d", n: 4 }]);
    expect(cv.driftResubs).toBe(0);
  });

  test("a where-flip exit backfills the tail the same way", async () => {
    const w = windowHarness(2);
    w.table.set("a", { n: 1, where: true });
    w.table.set("b", { n: 2, where: true });
    w.table.set("d", { n: 4, where: true });
    await w.h.subscribe("win"); // window [a,b]
    w.loaderCalls.length = 0;

    w.update("b", (c) => {
      c.where = false; // where-flip exit — the refill omits the requested id
    });
    await tick();

    expect(w.windowIdsOf()).toBe(1);
    // Refill of the flipped id (returns nothing) + backfill of the new tail.
    expect(w.loaderCalls).toEqual(["b", "d"]);
    const ds = deltas(w.h);
    expect(ds).toHaveLength(1);
    expect(ds[0]!.deletes).toEqual(["b"]);
    expect(ds[0]!.order).toEqual(["a", "d"]);

    const cv = makeClientView(keyOf);
    cv.applyAll(w.h.frames);
    expect(cv.value).toEqual([{ id: "a", n: 1 }, { id: "d", n: 4 }]);
  });

  test("a DELETE of an id OUTSIDE the snapshot is a total no-op (no query, no frame, no version bump)", async () => {
    const w = windowHarness(2);
    w.table.set("a", { n: 1, where: true });
    w.table.set("b", { n: 2, where: true });
    w.table.set("d", { n: 4, where: true }); // beyond the tail
    await w.h.subscribe("win"); // window [a,b]
    w.loaderCalls.length = 0;

    w.del("d"); // a window is a prefix of the total order — d is outside it
    await tick();

    expect(w.loaderCalls).toEqual([]);
    expect(w.windowIdsOf()).toBe(0);
    expect(deltas(w.h)).toHaveLength(0);

    w.update("a", (c) => {
      c.n = 0;
    });
    await tick();
    expect(deltas(w.h)[0]!.version).toBe(1); // no-op left the counter at 0
  });
});

describe("window membership — in-place path", () => {
  test("a pure in-place UPDATE ships one upsert with NO order and runs NO windowIdsOf", async () => {
    const w = windowHarness(3);
    w.table.set("a", { n: 1, where: true });
    w.table.set("b", { n: 2, where: true });
    await w.h.subscribe("win");
    w.loaderCalls.length = 0;

    w.update("a", (c) => {
      c.n = 0; // content change, still a member (window not full → order stable)
    });
    await tick();

    expect(w.loaderCalls).toEqual(["a"]); // one scoped refill, nothing else
    expect(w.windowIdsOf()).toBe(0); // the M5 in-place cost model
    const ds = deltas(w.h);
    expect(ds).toHaveLength(1);
    expect(ds[0]!.upserts).toEqual([["a", { id: "a", n: 0 }]]);
    expect(ds[0]!.order).toBeUndefined();
  });
});

describe("window membership — persistence exclusion + eviction", () => {
  test("a bounded window entry is NEVER persisted even when shouldPersist says yes, and evicts its snapshot on N→0", async () => {
    const persists: string[] = [];
    const w = windowHarness(2, {
      shouldPersist: () => true, // the hook opts in — the definition must veto
      captureWatermark: async () => "xmin-1",
      persistSnapshot: async (key) => {
        persists.push(key);
      },
    });
    w.table.set("a", { n: 1, where: true });
    w.table.set("b", { n: 2, where: true });
    await w.h.subscribe("win");
    w.update("a", (c) => {
      c.n = 0;
    });
    await tick();
    expect(persists).toEqual([]); // structurally excluded, not name-excluded

    // N→0 evicts the snapshot (no persisted-reconstruction carve-out applies)…
    await w.h.unsub("win");
    w.loaderCalls.length = 0;
    w.update("a", (c) => {
      c.n = 5;
    });
    await tick();
    // …so with zero subscribers nothing recomputes at all (needValue false).
    expect(w.loaderCalls).toEqual([]);
    expect(persists).toEqual([]);
  });

  test("contrast: the scopedMembership alias with the same hooks IS persisted (the carve-out is alias-only)", async () => {
    const persists: string[] = [];
    const { table, members } = makeTable();
    const h = createHarness({
      readSet: () => ["row_table"],
      shouldPersist: () => true,
      captureWatermark: async () => "xmin-1",
      persistSnapshot: async (key) => {
        persists.push(key);
      },
    });
    h.runtime.defineResource(
      { key: "rows", schema: rowsSchema, keyed: { keyOf } },
      {
        identityTable: "row_table",
        scopedMembership: {
          orderOf: async () => members().map((r) => r.id),
        },
        loader: (_p, c) =>
          c === undefined
            ? members()
            : c.affectedIds
                .filter((id) => table.get(id)?.where)
                .map((id) => ({ id, n: table.get(id)!.n })),
      },
    );
    table.set("a", { n: 1, where: true });
    h.runtime.applyDbChange({ table: "row_table", op: "U", ids: ["a"], origin: "row_table", identityBase: "row_table" });
    await tick();
    expect(persists).toEqual(["rows"]);
  });
});

describe("window membership — evicted-snapshot self-heal is bounded", () => {
  test("a short-circuited resub with an evicted snapshot self-heals via the entry's own bounded FULL loader", async () => {
    const w = windowHarness(2);
    w.table.set("a", { n: 1, where: true });
    w.table.set("b", { n: 2, where: true });
    w.table.set("d", { n: 4, where: true });
    await w.h.subscribe("win");
    const ack = w.h.frames.find((f) => f.kind === "sub-ack")!;
    expect(ack.value).toEqual([{ id: "a", n: 1 }, { id: "b", n: 2 }]); // bounded sub-ack

    await w.h.unsub("win"); // N→0 evicts the snapshot; the version survives
    await w.h.subscribe("win", {}, { version: 0, epoch: ack.epoch });
    expect(w.h.frames.filter((f) => f.kind === "up-to-date")).toHaveLength(1);
    w.loaderCalls.length = 0;

    w.update("a", (c) => {
      c.n = 0;
    });
    await tick();

    // No snapshot → drainMembershipFull → the entry loader at the window params,
    // which IS the bounded window read — "FULL" here can never be an unbounded
    // collection sweep. Ships a value-carrying update (never a delta on no base).
    expect(w.loaderCalls).toEqual(["FULL"]);
    const update = w.h.frames.find((f) => f.kind === "update")!;
    expect(update.value).toEqual([{ id: "a", n: 0 }, { id: "b", n: 2 }]);
    expect(w.h.frames.some((f) => f.kind === "delta")).toBe(false);

    const cv = makeClientView(keyOf);
    cv.applyAll(w.h.frames);
    expect(cv.value).toEqual([{ id: "a", n: 0 }, { id: "b", n: 2 }]);
    expect(cv.driftResubs).toBe(0);
  });
});

// --- Order-signature seam (window + orderSignatureOf) ---------------------------

// A bounded-window resource whose rows carry an order column (`n`, asc) AND a
// content-only column (`note`). `orderSignatureOf` encodes just `n`, so a `note`
// bump is in-place while an `n` bump re-derives the window — the notifications
// resurface flow (createdAt bumped, dismissed unchanged).
const sigRowsSchema = z.array(
  z.object({ id: z.string(), n: z.number(), note: z.string() }),
);

function sigHarness(limit: number) {
  const table = new Map<string, { n: number; note: string }>();
  const members = (): { id: string; n: number; note: string }[] =>
    [...table.entries()]
      .map(([id, c]) => ({ id, ...c }))
      .sort((a, b) => a.n - b.n || (a.id < b.id ? -1 : 1));
  const loaderCalls: string[] = [];
  let windowIdsOfCalls = 0;
  const h = createHarness({ readSet: () => ["sig_table"] });
  h.runtime.defineResource(
    { key: "sig", schema: sigRowsSchema, keyed: { keyOf } },
    {
      identityTable: "sig_table",
      membership: {
        kind: "window",
        windowIdsOf: async () => {
          windowIdsOfCalls++;
          return members()
            .slice(0, limit)
            .map((r) => r.id);
        },
        orderSignatureOf: (row) => String((row as { n: number }).n),
      },
      loader: (_p, c) => {
        if (c === undefined) {
          loaderCalls.push("FULL");
          return members().slice(0, limit);
        }
        loaderCalls.push([...c.affectedIds].sort().join(","));
        return c.affectedIds
          .filter((id) => table.has(id))
          .map((id) => ({ id, ...table.get(id)! }));
      },
    },
  );
  const feed = (op: "I" | "U" | "D", ids: string[] | null) =>
    h.runtime.applyDbChange({ table: "sig_table", op, ids, origin: "sig_table", identityBase: "sig_table" });
  const update = (id: string, mut: (c: { n: number; note: string }) => void) => {
    mut(table.get(id)!);
    feed("U", [id]);
  };
  return { h, table, loaderCalls, windowIdsOf: () => windowIdsOfCalls, feed, update };
}

describe("window membership — order signature", () => {
  test("an order-column bump on a member re-derives the window: one windowIdsOf, delta with the fresh order", async () => {
    const s = sigHarness(3);
    s.table.set("a", { n: 1, note: "" });
    s.table.set("b", { n: 2, note: "" });
    s.table.set("c", { n: 3, note: "" });
    await s.h.subscribe("sig"); // window [a,b,c], sigs seeded at sub-ack
    s.loaderCalls.length = 0;

    s.update("b", (c) => {
      c.n = 0; // resurface: the order column moves, membership unchanged
    });
    await tick();

    expect(s.loaderCalls).toEqual(["b"]); // one scoped refill — O(changed)
    expect(s.windowIdsOf()).toBe(1); // the signature move cost one bounded ids query
    const ds = deltas(s.h, "sig");
    expect(ds).toHaveLength(1);
    expect(ds[0]!.order).toEqual(["b", "a", "c"]);
    expect(ds[0]!.upserts).toEqual([["b", { id: "b", n: 0, note: "" }]]);
    expect(ds[0]!.deletes).toEqual([]);

    const cv = makeClientView(keyOf);
    cv.applyAll(s.h.frames);
    expect(cv.value).toEqual([
      { id: "b", n: 0, note: "" },
      { id: "a", n: 1, note: "" },
      { id: "c", n: 3, note: "" },
    ]);
    expect(cv.driftResubs).toBe(0);
  });

  test("a content-only bump keeps the in-place path: zero ids queries, order omitted", async () => {
    const s = sigHarness(3);
    s.table.set("a", { n: 1, note: "" });
    s.table.set("b", { n: 2, note: "" });
    await s.h.subscribe("sig");
    s.loaderCalls.length = 0;

    s.update("a", (c) => {
      c.note = "seen"; // the count/lastSeenAt-style bump — sig unchanged
    });
    await tick();

    expect(s.loaderCalls).toEqual(["a"]);
    expect(s.windowIdsOf()).toBe(0); // the M5 cost model is preserved
    const ds = deltas(s.h, "sig");
    expect(ds).toHaveLength(1);
    expect(ds[0]!.order).toBeUndefined();
    expect(ds[0]!.upserts).toEqual([["a", { id: "a", n: 1, note: "seen" }]]);
  });

  test("a member bumped past the tail leaves via order, pulling the new tail in", async () => {
    const s = sigHarness(2);
    s.table.set("a", { n: 1, note: "" });
    s.table.set("b", { n: 2, note: "" });
    s.table.set("d", { n: 4, note: "" }); // outside the limit-2 window
    await s.h.subscribe("sig"); // window [a,b]
    s.loaderCalls.length = 0;

    s.update("b", (c) => {
      c.n = 9; // moves past d — b leaves the window, d is pulled in
    });
    await tick();

    expect(s.windowIdsOf()).toBe(1);
    expect(s.loaderCalls).toEqual(["b", "d"]); // refill + tail backfill
    const ds = deltas(s.h, "sig");
    expect(ds).toHaveLength(1);
    // b was not a where-flip exit (the refill returned it), so it leaves purely
    // via the asserted order; d arrives as the backfilled upsert.
    expect(ds[0]!.deletes).toEqual([]);
    expect(ds[0]!.order).toEqual(["a", "d"]);
    expect((ds[0]!.upserts ?? []).map(([id]) => id)).toEqual(["d"]);

    const cv = makeClientView(keyOf);
    cv.applyAll(s.h.frames);
    expect(cv.value).toEqual([
      { id: "a", n: 1, note: "" },
      { id: "d", n: 4, note: "" },
    ]);
    expect(cv.driftResubs).toBe(0);
  });

  test("a signature move that leaves the window sequence intact ships in-place (one probe, no redundant order)", async () => {
    const s = sigHarness(3);
    s.table.set("a", { n: 1, note: "" });
    s.table.set("b", { n: 5, note: "" });
    await s.h.subscribe("sig"); // [a,b]
    s.loaderCalls.length = 0;

    s.update("b", (c) => {
      c.n = 9; // still last — order [a,b] unchanged
    });
    await tick();

    expect(s.windowIdsOf()).toBe(1); // the move had to be arbitrated once
    const ds = deltas(s.h, "sig");
    expect(ds).toHaveLength(1);
    expect(ds[0]!.order).toBeUndefined(); // but no redundant membership delta
    expect(ds[0]!.upserts).toEqual([["b", { id: "b", n: 9, note: "" }]]);
  });

  test("signature lifecycle mirrors the snapshot: FULL rebuild and sub-ack reseed both restore fresh sigs", async () => {
    const s = sigHarness(3);
    s.table.set("a", { n: 1, note: "" });
    s.table.set("b", { n: 2, note: "" });
    await s.h.subscribe("sig");

    // A sticky-FULL contributor rebuilds the snapshot AND the sig map.
    s.feed("I", null);
    await tick();
    expect(s.windowIdsOf()).toBe(0); // the FULL path never runs the ids query

    // A content-only bump right after the FULL rebuild stays in-place — a lost
    // sig would read as "moved" and cost a windowIdsOf here.
    s.update("a", (c) => {
      c.note = "x";
    });
    await tick();
    expect(s.windowIdsOf()).toBe(0);

    // N→0 evicts sigs with the snapshot; a fresh sub-ack reseeds both, so a
    // subsequent order move is detected with exactly one ids query.
    await s.h.unsub("sig");
    await s.h.subscribe("sig");
    s.update("b", (c) => {
      c.n = 0;
    });
    await tick();
    expect(s.windowIdsOf()).toBe(1);
    const last = deltas(s.h, "sig").at(-1)!;
    expect(last.order).toEqual(["b", "a"]);
  });
});

// --- Point membership ---------------------------------------------------------

// A point resource "pt" whose params carry an explicit comma-joined id set (the
// wire encoding is the client-descriptor layer's business — the runtime only sees
// `idsOf`). The loader is the scoped read over the requested/params ids.
function pointHarness(runtimeOpts: Parameters<typeof createHarness>[0] = {}) {
  const table = new Map<string, { n: number }>();
  const loaderCalls: string[] = [];
  const idsOf = (p: Record<string, string>) => (p.ids ?? "").split(",").filter(Boolean);
  const h = createHarness({ readSet: () => ["pt_table"], sockets: 2, ...runtimeOpts });
  h.runtime.defineResource(
    { key: "pt", schema: rowsSchema, keyed: { keyOf } },
    {
      identityTable: "pt_table",
      membership: { kind: "point", idsOf },
      loader: (p, c) => {
        const ids = c ? [...c.affectedIds] : idsOf(p);
        loaderCalls.push((c ? "scoped:" : "FULL:") + [...ids].sort().join(","));
        return ids.filter((id) => table.has(id)).map((id) => ({ id, n: table.get(id)!.n }));
      },
    },
  );
  const feed = (op: "I" | "U" | "D", ids: string[] | null) =>
    h.runtime.applyDbChange({ table: "pt_table", op, ids, origin: "pt_table", identityBase: "pt_table" });
  return { h, table, loaderCalls, feed };
}

describe("point membership — routing by id intersection", () => {
  test("a change routes ONLY to the subscribed tuples whose id set intersects it", async () => {
    const p = pointHarness();
    p.table.set("a", { n: 1 });
    p.table.set("b", { n: 2 });
    p.table.set("c", { n: 3 });
    await p.h.subscribe("pt", { ids: "a,b" }, { socket: 0 });
    await p.h.subscribe("pt", { ids: "c" }, { socket: 1 });
    p.loaderCalls.length = 0;

    // UPDATE a → only the {a,b} tuple refills and receives a frame.
    p.table.set("a", { n: 9 });
    p.feed("U", ["a"]);
    await tick();
    expect(p.loaderCalls).toEqual(["scoped:a"]);
    let ds = deltas(p.h, "pt");
    expect(ds).toHaveLength(1);
    expect(ds[0]!.socket).toBe(0);
    expect(ds[0]!.upserts).toEqual([["a", { id: "a", n: 9 }]]);
    expect(ds[0]!.order).toBeUndefined();

    // DELETE c → only the {c} tuple, as a zero-query delete.
    p.loaderCalls.length = 0;
    p.table.delete("c");
    p.feed("D", ["c"]);
    await tick();
    expect(p.loaderCalls).toEqual([]); // a deleted row is never refilled
    ds = deltas(p.h, "pt");
    expect(ds).toHaveLength(2);
    expect(ds[1]!.socket).toBe(1);
    expect(ds[1]!.deletes).toEqual(["c"]);
    expect(ds[1]!.order).toEqual([]);

    // A change to a foreign id reaches NO tuple: no loader, no frame.
    p.loaderCalls.length = 0;
    p.table.set("z", { n: 0 });
    p.feed("I", ["z"]);
    await tick();
    expect(p.loaderCalls).toEqual([]);
    expect(deltas(p.h, "pt")).toHaveLength(2); // unchanged

    // Both clients converge to their own tuple's truth.
    const cv0 = makeClientView(keyOf);
    cv0.applyAll(p.h.framesFor(0));
    expect(cv0.value).toEqual([{ id: "a", n: 9 }, { id: "b", n: 2 }]);
    const cv1 = makeClientView(keyOf);
    cv1.applyAll(p.h.framesFor(1));
    expect(cv1.value).toEqual([]);
  });

  test("an INSERT for a subscribed id with no prior row enters the point set (appended, no ids query)", async () => {
    const p = pointHarness();
    p.table.set("a", { n: 1 });
    await p.h.subscribe("pt", { ids: "a,b" }); // b has no row yet → value [a]
    const ack = p.h.frames.find((f) => f.kind === "sub-ack")!;
    expect(ack.value).toEqual([{ id: "a", n: 1 }]);
    p.loaderCalls.length = 0;

    p.table.set("b", { n: 7 });
    p.feed("I", ["b"]);
    await tick();

    expect(p.loaderCalls).toEqual(["scoped:b"]); // O(changed), never O(set)
    const ds = deltas(p.h, "pt");
    expect(ds).toHaveLength(1);
    expect(ds[0]!.upserts).toEqual([["b", { id: "b", n: 7 }]]);
    expect(ds[0]!.order).toEqual(["a", "b"]); // entrant appended

    const cv = makeClientView(keyOf);
    cv.applyAll(p.h.frames);
    expect(cv.value).toEqual([{ id: "a", n: 1 }, { id: "b", n: 7 }]);
    expect(cv.driftResubs).toBe(0);
  });

  test("a point entry is excluded from persistence even when shouldPersist says yes", async () => {
    const persists: string[] = [];
    const p = pointHarness({
      shouldPersist: () => true,
      captureWatermark: async () => "xmin-1",
      persistSnapshot: async (key) => {
        persists.push(key);
      },
    });
    p.table.set("a", { n: 1 });
    await p.h.subscribe("pt", { ids: "a" });
    p.table.set("a", { n: 2 });
    p.feed("U", ["a"]);
    await tick();
    expect(deltas(p.h, "pt")).toHaveLength(1); // the change itself shipped
    expect(persists).toEqual([]);
  });
});

describe("membership — registration guards", () => {
  test("membership and scopedMembership are mutually exclusive", () => {
    const h = createHarness();
    expect(() =>
      h.runtime.defineResource(
        { key: "bad", schema: rowsSchema, keyed: { keyOf } },
        {
          identityTable: "t",
          scopedMembership: { orderOf: async () => [] },
          membership: { kind: "window", windowIdsOf: async () => [] },
          loader: async () => [],
        },
      ),
    ).toThrow(/mutually exclusive/);
  });

  test("membership requires keyed mode", () => {
    const h = createHarness();
    expect(() =>
      h.runtime.defineResource({
        key: "bad2",
        mode: "push",
        schema: z.number(),
        identityTable: "t",
        // @ts-expect-error — membership is not on the non-keyed input form
        membership: { kind: "point", idsOf: () => [] },
        loader: async () => 1,
      }),
    ).toThrow(/membership requires mode "keyed"/);
  });

  test("membership requires an identityTable", () => {
    const h = createHarness();
    expect(() =>
      h.runtime.defineResource(
        { key: "bad3", schema: rowsSchema, keyed: { keyOf } },
        {
          recompute: { kind: "full", reason: "test" },
          membership: { kind: "window", windowIdsOf: async () => [] },
          loader: async () => [],
        },
      ),
    ).toThrow(/membership requires an identityTable/);
  });
});
