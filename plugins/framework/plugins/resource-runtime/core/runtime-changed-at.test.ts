/**
 * `changedAt` — the change's wall clock, carried onto pushed value frames so an
 * open tab can measure change → applied on a clock the serving thread does not
 * own. Run with
 * `bun test plugins/framework/plugins/resource-runtime/core/runtime-changed-at.test.ts`.
 *
 * Observability only: nothing in the runtime reads it back. What is pinned here is
 * what a latency reader depends on — the EARLIEST change of a coalesced pending
 * wins, a hand `notify()` stamps its own call time, the stamp follows a cascade
 * downstream, and a read-path frame (no change behind it) carries none.
 */

import { test, expect, describe } from "bun:test";
import { z } from "zod";
import { createHarness, tick, type RecordedFrame } from "./test-support";

type Stamped = RecordedFrame & { changedAt?: number };

describe("changedAt on pushed frames", () => {
  test("a feed-driven update carries the earliest change time of the changes it coalesced", async () => {
    const h = createHarness({ readSet: () => ["t"] });
    h.runtime.defineResource({
      key: "r",
      mode: "push",
      identityTable: "t",
      schema: z.number(),
      loader: async () => 1,
    });
    await h.subscribe("r");
    const before = h.frames.length;

    // Two changes land in one pending before the flush: later first, earlier second.
    for (const changedAt of [2_000, 1_000]) {
      h.runtime.applyDbChange({
        table: "t",
        op: "U",
        ids: ["a"],
        origin: "t",
        identityBase: "t",
        changedAt,
      });
    }
    await tick();

    const pushed = h.frames.slice(before) as Stamped[];
    const updates = pushed.filter((f) => f.kind === "update");
    expect(updates.length).toBeGreaterThan(0);
    expect(updates[0]?.changedAt).toBe(1_000);
  });

  test("the sub-ack that answers a subscribe carries no change time", async () => {
    const h = createHarness({ readSet: () => ["t"] });
    h.runtime.defineResource({
      key: "r",
      mode: "push",
      identityTable: "t",
      schema: z.number(),
      loader: async () => 1,
    });
    await h.subscribe("r");
    const acks = h.frames.filter((f) => f.kind === "sub-ack") as Stamped[];
    expect(acks.length).toBe(1);
    expect("changedAt" in (acks[0] ?? {})).toBe(false);
  });

  test("a hand notify() of an external resource stamps the time of the call", async () => {
    const h = createHarness();
    const r = h.runtime.defineExternalResource({
      key: "ext",
      mode: "push",
      schema: z.number(),
      loader: async () => 1,
    });
    await h.subscribe("ext");
    const before = h.frames.length;
    const t0 = Date.now();
    r.notify();
    await tick();
    const update = (h.frames.slice(before) as Stamped[]).find(
      (f) => f.kind === "update",
    );
    expect(update?.changedAt).toBeGreaterThanOrEqual(t0);
    expect(update?.changedAt).toBeLessThanOrEqual(Date.now());
  });

  test("a change with no time (catch-up replay, pre-upgrade NOTIFY) ships a frame without one", async () => {
    const h = createHarness({ readSet: () => ["t"] });
    h.runtime.defineResource({
      key: "r",
      mode: "push",
      identityTable: "t",
      schema: z.number(),
      loader: async () => 1,
    });
    await h.subscribe("r");
    const before = h.frames.length;
    h.runtime.applyDbChange({
      table: "t",
      op: "U",
      ids: ["a"],
      origin: "t",
      identityBase: "t",
    });
    await tick();
    const update = (h.frames.slice(before) as Stamped[]).find(
      (f) => f.kind === "update",
    );
    expect(update).toBeDefined();
    expect("changedAt" in (update ?? {})).toBe(false);
  });
});
