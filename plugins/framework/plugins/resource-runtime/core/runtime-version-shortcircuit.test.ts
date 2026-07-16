/**
 * Version short-circuit (bootEpoch) — the replay-storm cure. Run with
 * `bun test plugins/framework/plugins/resource-runtime/core/runtime-version-shortcircuit.test.ts`.
 *
 * A `sub` that echoes the (epoch, version) its cached value was produced under
 * is answered `up-to-date` from the in-memory per-pk version counter when the
 * epoch is THIS boot and the version matches — NO loader run, NO read-admission
 * slot. For a non-`revalidate` resource the version counter is its complete
 * change signal (every state change routes through flushNotifies, which bumps
 * it), so same-boot + same-version ⇒ the client's value is current. This is
 * what makes a chronic full-set sub replay cost ~0 instead of ~250 gated loader
 * runs per tab. See
 * research/perfs/2026-07-11-compressor-thrash-subscription-replay-storm.md
 * Findings 2–3.
 *
 * Restrictions pinned here: wrong/absent epoch → full path (versions are
 * per-boot in-memory state, incomparable across restarts); version mismatch →
 * full path; `revalidate` resources are exempt (their freshness authority is
 * the ETag signature, whose truth may live outside the notify stream).
 */

import { test, expect, describe, mock } from "bun:test";
import { z } from "zod";
import { createHarness, controllable, tick, makeClientView } from "./test-support";

const rowsSchema = z.array(z.object({ id: z.string(), n: z.number() }));
const keyOf = (r: unknown) => (r as { id: string }).id;

describe("version short-circuit — same-boot epoch + matching version", () => {
  test("epoch+version match → up-to-date (with epoch), zero loader runs, zero gate slots", async () => {
    const onReadGateWait = mock((_ms: number) => {});
    const onSubShortCircuit = mock((_key: string) => {});
    const h = createHarness({ onReadGateWait, onSubShortCircuit });
    let loads = 0;
    const r = h.runtime.defineExternalResource({
      key: "r",
      mode: "push",
      schema: z.string(),
      loader: async () => {
        loads++;
        return "val";
      },
    });

    // Fresh sub → full sub-ack carrying the boot epoch (the client learns it).
    await h.subscribe("r");
    const ack = h.frames.find((f) => f.kind === "sub-ack")!;
    expect(ack.version).toBe(0);
    expect(typeof ack.epoch).toBe("string");
    expect(loads).toBe(1);

    // A notify advances the version to 1 (the client applies the update).
    r.notify();
    await tick();
    const update = h.frames.find((f) => f.kind === "update")!;
    expect(update.version).toBe(1);
    expect(loads).toBe(2);

    // Replayed sub echoing (epoch, version=1) → up-to-date from memory: no
    // loader run, no read-admission slot (the gate's onWait never fired again),
    // and the short-circuit hook fired.
    const gateWaitsBefore = onReadGateWait.mock.calls.length;
    await h.subscribe("r", {}, { version: 1, epoch: ack.epoch });
    const utd = h.frames.find((f) => f.kind === "up-to-date")!;
    expect(utd.version).toBe(1);
    expect(utd.epoch).toBe(ack.epoch);
    expect("value" in utd).toBe(false);
    expect(loads).toBe(2); // loader did NOT run
    expect(onReadGateWait.mock.calls.length).toBe(gateWaitsBefore); // gate untouched
    expect(onSubShortCircuit).toHaveBeenCalledTimes(1);
    expect(onSubShortCircuit).toHaveBeenCalledWith("r");
  });

  test("version match under a WRONG or ABSENT epoch → full sub-ack (loader runs)", async () => {
    const h = createHarness();
    let loads = 0;
    h.runtime.defineExternalResource({
      key: "r",
      mode: "push",
      schema: z.string(),
      loader: async () => {
        loads++;
        return "val";
      },
    });

    await h.subscribe("r");
    expect(loads).toBe(1);

    // Wrong epoch (a previous boot's): the version echo is incomparable.
    await h.subscribe("r", {}, { version: 0, epoch: "some-older-boot" });
    expect(loads).toBe(2);
    // Absent epoch (an old client): same.
    await h.subscribe("r", {}, { version: 0 });
    expect(loads).toBe(3);
    expect(h.frames.some((f) => f.kind === "up-to-date")).toBe(false);
    expect(h.frames.filter((f) => f.kind === "sub-ack")).toHaveLength(3);
  });

  test("version MISMATCH under the right epoch → full sub-ack at the current version", async () => {
    const h = createHarness();
    let loads = 0;
    const r = h.runtime.defineExternalResource({
      key: "r",
      mode: "push",
      schema: z.string(),
      loader: async () => {
        loads++;
        return `val-${loads}`;
      },
    });

    await h.subscribe("r");
    const epoch = h.frames.find((f) => f.kind === "sub-ack")!.epoch!;
    r.notify(); // version → 1; the client that echoes 0 below is behind
    await tick();

    await h.subscribe("r", {}, { version: 0, epoch });
    const acks = h.frames.filter((f) => f.kind === "sub-ack");
    expect(acks).toHaveLength(2);
    expect(acks[1]!.version).toBe(1); // served fresh at the current version
    expect(h.frames.some((f) => f.kind === "up-to-date")).toBe(false);
  });

  test("a revalidate resource IGNORES the version echo — its authority is the ETag", async () => {
    // The resource's truth may live outside the notify stream (git state), so a
    // matching version must not short-circuit; only a matching signature may.
    const h = createHarness();
    let loads = 0;
    h.runtime.defineExternalResource({
      key: "edited",
      mode: "invalidate",
      schema: z.string(),
      loader: async () => {
        loads++;
        return "val";
      },
      revalidate: async () => "sig-1",
    });

    await h.subscribe("edited");
    const ack = h.frames.find((f) => f.kind === "sub-ack")!;
    expect(loads).toBe(1);

    // Version+epoch match but a STALE etag → the full loader path (a sub-ack),
    // never the version short-circuit.
    await h.subscribe("edited", {}, { version: 0, epoch: ack.epoch, etag: "stale" });
    expect(loads).toBe(2);
    expect(h.frames.filter((f) => f.kind === "sub-ack")).toHaveLength(2);
    expect(h.frames.some((f) => f.kind === "up-to-date")).toBe(false);
  });

  test("keyed: a short-circuited resub with an evicted snapshot self-heals — the next notify ships a FULL update", async () => {
    // releaseSubRefcount evicts `snapshots` (not `versions`) on N→0. A resub
    // that short-circuits therefore skips the snapshot re-seed; the next notify
    // finds hadSnapshot === false and ships a FULL update — correct and
    // self-healing, and the client converges.
    const h = createHarness({ readSet: () => ["row_table"] });
    const ctl = controllable<{ id: string; n: number }[]>([
      { id: "a", n: 1 },
      { id: "b", n: 1 },
    ]);
    h.runtime.defineResource(
      { key: "rows", schema: rowsSchema, keyed: { keyOf } },
      {
        identityTable: "row_table",
        loader: (_p, c) =>
          c ? ctl.value.filter((row) => c.affectedIds.includes(row.id)) : ctl.loader(),
      },
    );

    await h.subscribe("rows");
    const ack = h.frames.find((f) => f.kind === "sub-ack")!;
    expect(ack.version).toBe(0);

    // N→0 evicts the keyed snapshot; the version counter survives.
    await h.unsub("rows");

    // Resub echoing (epoch, version) → short-circuit: up-to-date, NO snapshot
    // re-seed (that is the point — no loader ran).
    await h.subscribe("rows", {}, { version: 0, epoch: ack.epoch });
    expect(h.frames.filter((f) => f.kind === "up-to-date")).toHaveLength(1);
    expect(h.frames.filter((f) => f.kind === "sub-ack")).toHaveLength(1);

    // A subsequent scoped change finds no snapshot → the runtime reloads FULL
    // and ships a value-carrying update (never a delta onto a missing base).
    ctl.setValue([{ id: "a", n: 2 }, { id: "b", n: 1 }]);
    h.runtime.applyDbChange({
      table: "row_table",
      op: "U",
      ids: ["a"],
      origin: "row_table",
      identityBase: "row_table",
    });
    await tick();

    const update = h.frames.find((f) => f.kind === "update")!;
    expect(update.version).toBe(1);
    expect(h.frames.some((f) => f.kind === "delta")).toBe(false);

    // The client converges to server truth across the whole frame history.
    const cv = makeClientView(keyOf);
    cv.applyAll(h.frames);
    expect(cv.value).toEqual([{ id: "a", n: 2 }, { id: "b", n: 1 }]);
    expect(cv.version).toBe(1);
    expect(cv.driftResubs).toBe(0);
  });

  test("acks carry the boot epoch, stable across frames; _debug counts short-circuits per key", async () => {
    const h = createHarness();
    h.runtime.defineExternalResource({
      key: "r",
      mode: "push",
      schema: z.string(),
      loader: async () => "val",
    });

    await h.subscribe("r");
    const epoch = h.frames.find((f) => f.kind === "sub-ack")!.epoch!;
    await h.subscribe("r", {}, { version: 0, epoch });
    await h.subscribe("r", {}, { version: 0, epoch });
    const utds = h.frames.filter((f) => f.kind === "up-to-date");
    expect(utds).toHaveLength(2);
    for (const f of utds) expect(f.epoch).toBe(epoch); // one epoch per boot

    const res = await h.runtime.handleResourceHttp(
      new Request("http://localhost/api/resources/_debug"),
      { key: "_debug" },
    );
    const body = (await res.json()) as {
      resources: Array<{ key: string; subShortCircuits: number }>;
    };
    expect(body.resources.find((r) => r.key === "r")!.subShortCircuits).toBe(2);
  });

  test("HTTP path has NO version short-circuit — an invalidate refetch always gets a body", async () => {
    // The client's HTTP guard is strict-`<`: the normal invalidate-mode refetch
    // returns a body at an EQUAL version. A version short-circuit here would
    // starve that refetch, so the HTTP path deliberately never short-circuits.
    const h = createHarness();
    let loads = 0;
    h.runtime.defineExternalResource({
      key: "r",
      mode: "invalidate",
      schema: z.string(),
      loader: async () => {
        loads++;
        return "val";
      },
    });
    // The HTTP body carries `epoch: bootEpoch` — the same epoch the ack frames
    // carry (Fix B) — so the client can compare its cached version cross-boot. Grab
    // the ack epoch first, then reset `loads` so the HTTP no-short-circuit assertion
    // counts only the GET's own load.
    await h.subscribe("r");
    const ackEpoch = h.frames.find((f) => f.kind === "sub-ack")!.epoch!;
    loads = 0;
    const res = await h.runtime.handleResourceHttp(
      new Request("http://localhost/api/resources/r"),
      { key: "r" },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { value: unknown; version: number; epoch: string };
    expect(body.value).toBe("val");
    expect(body.epoch).toBe(ackEpoch);
    expect(loads).toBe(1);
  });
});
