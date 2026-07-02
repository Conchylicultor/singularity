/**
 * H5 — the notify-vs-fresh-sub race. Run with
 * `bun test plugins/framework/plugins/resource-runtime/core/runtime-h5.test.ts`.
 *
 * `research/2026-04-15-global-sse-lifecycle-mental-model-v3.md` §9 (H5) prescribes
 * "test by racing a `notify()` against a fresh `sub` in a unit test". A fresh
 * subscription reads its sub-ack version up front (a read never bumps —
 * `runtime.ts:1952`) and then parks on the loader; meanwhile a concurrent push
 * bumps the version and ships a newer frame. The invariant the client leans on:
 * the stale sub-ack (older version) can NEVER overwrite the newer push, because
 * the WS version guard applies a frame iff `frame.version > entry.version`
 * (`notifications-client.ts:862`). These tests drive the recorded frames through
 * the real client simulator (`makeClientView`) and assert it converges to server
 * truth — not merely that a frame of the right shape was sent.
 *
 * A load-bearing mechanic these pin: a fresh sub's FULL loader and a concurrent
 * FULL push COALESCE onto ONE in-flight promise (`getResourceValue`), so both read
 * the identical value at release — and the flush continuation (the push) sends
 * BEFORE `handleSub`'s continuation (the stale sub-ack), so the sub-ack lands last
 * and is version-dropped. H5c leans on this: the sub-ack's keyed snapshot-seed
 * (`runtime.ts:1989`) writes the SAME id→hash the push already seeded, so it is
 * idempotent and a subsequent delta merges without drift.
 */

import { test, expect, describe } from "bun:test";
import { z } from "zod";
import { createHarness, controllable, tick, makeClientView } from "./test-support";

const rowsSchema = z.array(z.object({ id: z.string(), n: z.number() }));
const keyOf = (r: unknown) => (r as { id: string }).id;

describe("H5 — notify races a fresh sub", () => {
  test("H5a: a push landing while a fresh sub's loader is parked wins; the stale sub-ack is version-dropped", async () => {
    const h = createHarness();
    const ctl = controllable("A");
    const r = h.runtime.defineExternalResource({
      key: "r",
      mode: "push",
      schema: z.string(),
      loader: ctl.loader,
    });

    // Fresh subscribe whose loader parks. Registration (refcount + sub entry) is
    // synchronous — before the loader await — so this socket IS a subscriber by
    // the time the notify flushes, and the sub-ack version (0) is read up front.
    ctl.block();
    ctl.setValue("B");
    await h.subscribe("r"); // sub-ack parked on the blocked loader
    expect(h.frames).toHaveLength(0); // nothing sent yet

    // Notify while parked: the flush bumps the version to 1 and parks on the SAME
    // coalesced load, so no frame is sent until release.
    r.notify();
    await tick();
    expect(h.frames).toHaveLength(0);

    ctl.release();
    await tick();

    // Two frames: the push (update v1) sent BEFORE the stale sub-ack (v0) — the
    // race. The sub-ack's version (0) is not strictly greater than the push's (1),
    // so the client version-drops it.
    const update = h.frames.find((f) => f.kind === "update")!;
    const subAck = h.frames.find((f) => f.kind === "sub-ack")!;
    expect(update.version).toBe(1);
    expect(update.value).toBe("B");
    expect(subAck.version).toBe(0);
    expect(update.seq).toBeLessThan(subAck.seq); // push shipped first; sub-ack is the trailer

    // The real client, fed the frames in send order, converges to the LATEST
    // loader output at the push's version — the stale sub-ack changes nothing.
    const cv = makeClientView();
    cv.applyAll(h.frames);
    expect(cv.value).toBe("B");
    expect(cv.version).toBe(1); // monotonic — never regressed to the sub-ack's 0
    expect(cv.driftResubs).toBe(0);
  });

  test("H5b: reverse ordering (sub completes, THEN a notify) also converges", async () => {
    const h = createHarness();
    const ctl = controllable("A");
    const r = h.runtime.defineExternalResource({
      key: "r",
      mode: "push",
      schema: z.string(),
      loader: ctl.loader,
    });

    await h.subscribe("r"); // sub-ack v0, value A (loader open)
    ctl.setValue("B");
    r.notify(); // now a real change
    await tick();

    const cv = makeClientView();
    cv.applyAll(h.frames);
    expect(cv.value).toBe("B");
    expect(cv.version).toBe(1);
    expect(cv.driftResubs).toBe(0);
    // sub-ack (v0) then update (v1) — versions strictly increasing in send order.
    expect(h.frames.map((f) => f.version)).toEqual([0, 1]);
  });

  test("H5c: keyed — a fresh sub races a FULL update, then a subsequent delta merges without drift", async () => {
    // The deep one. Exercises `handleSub`'s unconditional keyed snapshot-seed
    // (`runtime.ts:1989`) against a concurrent higher-versioned FULL push that
    // already advanced the server snapshot. GREEN because the fresh sub's FULL
    // loader coalesces with the push's FULL loader onto one in-flight value, so
    // the sub-ack re-seeds the snapshot with the identical id→hash the push wrote
    // — idempotent, never a regression — and the following scoped delta diffs
    // against a correct snapshot. If this ever RED-ed (drift / stale client), the
    // sub-ack seed would be clobbering a push-advanced snapshot and the fix would
    // live in `handleSub`; it does not, so no guard is needed.
    const h = createHarness({ readSet: () => ["row_table"] });
    const ctl = controllable<{ id: string; n: number }[]>([
      { id: "a", n: 1 },
      { id: "b", n: 1 },
    ]);
    h.runtime.defineResource(
      { key: "rows", schema: rowsSchema, keyed: { keyOf } },
      {
        identityTable: "row_table",
        // FULL and (later) scoped both read the same controllable value; the
        // scoped ctx narrows to the affected rows.
        loader: (_p, c) => (c ? ctl.value.filter((row) => c.affectedIds.includes(row.id)) : ctl.loader()),
      },
    );

    // Fresh subscribe parks; a FULL feed change (INSERT → ids null) races it.
    ctl.block();
    ctl.setValue([{ id: "a", n: 2 }, { id: "b", n: 1 }]);
    await h.subscribe("rows"); // sub-ack parked
    h.runtime.applyDbChange({
      table: "row_table",
      op: "I",
      ids: null,
      origin: "row_table",
      identityBase: "row_table",
    });
    await tick();
    ctl.release();
    await tick();

    // First race: a FULL update (v1) before the stale sub-ack (v0).
    const firstUpdate = h.frames.find((f) => f.kind === "update")!;
    expect(firstUpdate.version).toBe(1);
    const staleAck = h.frames.find((f) => f.kind === "sub-ack")!;
    expect(staleAck.version).toBe(0);

    // A SUBSEQUENT scoped change ships a delta the client must merge onto the base
    // seeded by the (idempotent) snapshot — no drift.
    ctl.setValue([{ id: "a", n: 3 }, { id: "b", n: 1 }]);
    h.runtime.applyDbChange({
      table: "row_table",
      op: "U",
      ids: ["a"],
      origin: "row_table",
      identityBase: "row_table",
    });
    await tick();

    const deltas = h.pushesFor("rows").filter((f) => f.kind === "delta");
    expect(deltas).toHaveLength(1);
    expect(deltas[0]!.version).toBe(2);

    // The client, fed every frame, converges to server truth: a=3 (from the delta)
    // and b=1, at version 2, with zero drift-resubs (the base was never missing).
    const cv = makeClientView(keyOf);
    cv.applyAll(h.frames);
    expect(cv.value).toEqual([{ id: "a", n: 3 }, { id: "b", n: 1 }]);
    expect(cv.version).toBe(2);
    expect(cv.driftResubs).toBe(0);
  });

  test("H5d: a second socket subscribing mid-flush costs the first socket no frame", async () => {
    const h = createHarness({ sockets: 2 });
    const ctl = controllable(0);
    const r = h.runtime.defineExternalResource({
      key: "r",
      mode: "push",
      schema: z.number(),
      loader: ctl.loader,
    });

    await h.subscribe("r", {}, { socket: 0 }); // A: sub-ack v0
    // Block, notify → the flush parks on A's push load (version already bumped to 1).
    ctl.block();
    ctl.setValue(9);
    r.notify();
    await tick(); // flush is mid-await

    // B subscribes mid-flush; its sub-ack coalesces onto the same blocked load.
    await h.subscribe("r", {}, { socket: 1 });
    ctl.release();
    await tick();

    // A lost no frame: it still received exactly its push (update v1).
    const aPushes = h.pushesFor("r", 0);
    expect(aPushes).toHaveLength(1);
    expect(aPushes[0]!.kind).toBe("update");
    expect(aPushes[0]!.version).toBe(1);

    // Both sockets' clients converge to the same server truth (value 9, v1).
    const a = makeClientView();
    a.applyAll(h.framesFor(0));
    const b = makeClientView();
    b.applyAll(h.framesFor(1));
    expect(a.value).toBe(9);
    expect(a.version).toBe(1);
    expect(b.value).toBe(9);
    expect(b.version).toBe(1); // B read the already-bumped version at its mid-flush sub
  });
});
