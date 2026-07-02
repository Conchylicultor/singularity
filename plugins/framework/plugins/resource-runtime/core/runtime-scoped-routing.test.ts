/**
 * Scoped-vs-FULL routing-table gaps. Run with
 * `bun test plugins/framework/plugins/resource-runtime/core/runtime-scoped-routing.test.ts`.
 *
 * The scoped-recompute routing table decides, per resource per flush, whether a
 * change recomputes only the affected rows (`ctx.affectedIds`, a `WHERE id IN (…)`
 * scoped load) or the whole view (`ctx === undefined`, FULL). This file pins the
 * COALESCING corners that `mergePending` (`runtime.ts:1087`) and `drainEntry`
 * (`runtime.ts:1544`) own within a single flush:
 *
 *   - sticky-FULL absorption (both orders): an id-less contributor in the same
 *     flush sticks the pk at FULL (`mergePending` null-absorption, `runtime.ts:1103`).
 *   - scoped∪scoped union: two scoped changes coalesce their id sets.
 *   - empty-scoped-set no-op: a downstream handed an empty (non-null) affected set
 *     is skipped entirely — no version bump, no frame, no cascade
 *     (`drainEntry`'s `continue`, `runtime.ts:1575`).
 *
 * The routing cases ALREADY covered in `runtime.test.ts` are not duplicated here:
 *   - covered-origin identity scoping ("a single-row UPDATE scopes to a keyed resource"),
 *   - edge-covered-origin suppression ("an edge-covered origin is suppressed …"),
 *   - secondary-view FULL not absorbing a scoped edge delivery,
 *   - the upstream-signature relevance gate (`relevant.size === 0` short-circuit),
 *   - DELETE / no-identityTable degrade-to-FULL.
 * This file is strictly the same-flush `mergePending`/`drainEntry` coalescing that
 * those edge-level tests do not reach.
 */

import { test, expect, describe } from "bun:test";
import { z } from "zod";
import { createHarness, tick } from "./test-support";

const rowsSchema = z.array(z.object({ id: z.string(), n: z.number() }));
const keyOf = (r: unknown) => (r as { id: string }).id;

// A keyed resource whose loader records how each post-subscribe load was scoped:
// "FULL" for `ctx === undefined`, else the sorted affected-id list. The two feed
// changes ride ONE flush because both `applyDbChange` calls run synchronously
// before the queued microtask flush drains — so they coalesce in `pendingNotifies`.
function scopeRecordingHarness() {
  const h = createHarness({ readSet: () => ["row_table"] });
  const loads: string[] = [];
  h.runtime.defineResource(
    { key: "rows", schema: rowsSchema, keyed: { keyOf } },
    {
      identityTable: "row_table",
      loader: (_p, c) => {
        loads.push(c === undefined ? "FULL" : [...c.affectedIds].sort().join(","));
        return [{ id: "a", n: 1 }, { id: "b", n: 1 }];
      },
    },
  );
  const scoped = (ids: string[]) =>
    h.runtime.applyDbChange({ table: "row_table", op: "U", ids, origin: "row_table", identityBase: "row_table" });
  const full = () =>
    h.runtime.applyDbChange({ table: "row_table", op: "I", ids: null, origin: "row_table", identityBase: "row_table" });
  return { h, loads, scoped, full };
}

describe("scoped-vs-FULL routing — same-flush coalescing", () => {
  test("sticky-FULL absorption (scoped THEN full): an id-less contributor forces the pk to FULL", async () => {
    const { h, loads, scoped, full } = scopeRecordingHarness();
    await h.subscribe("rows");
    loads.length = 0; // ignore the sub-ack's full seed load

    // One flush, scoped-first: mergePending records {a}, then the FULL (null)
    // absorbs it → the loader recomputes FULL, never a scoped partial.
    scoped(["a"]);
    full();
    await tick();

    expect(loads).toEqual(["FULL"]);
  });

  test("sticky-FULL absorption (full THEN scoped): the pk stays FULL once id-less", async () => {
    const { h, loads, scoped, full } = scopeRecordingHarness();
    await h.subscribe("rows");
    loads.length = 0;

    // FULL-first: the pending entry is already FULL (null); the later scoped {a}
    // cannot narrow it (`existing.affected === null` returns early).
    full();
    scoped(["a"]);
    await tick();

    expect(loads).toEqual(["FULL"]);
  });

  test("scoped∪scoped union: two scoped changes coalesce their affected-id sets", async () => {
    const { h, loads, scoped } = scopeRecordingHarness();
    await h.subscribe("rows");
    loads.length = 0;

    // Two scoped changes to the same pk in one flush → the loader sees the UNION.
    scoped(["a"]);
    scoped(["b"]);
    await tick();

    expect(loads).toEqual(["a,b"]);
  });

  test("empty-scoped-set no-op: an empty (non-null) downstream affected set skips the drain entirely", async () => {
    // `up` is the covered origin; `down` cascades off it via an `affectedMap` that
    // maps every change to the EMPTY set (nothing downstream is affected). The
    // cascade hands `down` an empty, NON-null affected set, so `drainEntry`
    // `continue`s: no version bump, no frame, no further cascade. This is distinct
    // from the upstream-signature relevance gate (which short-circuits the edge
    // BEFORE `affectedMap`); here `affectedMap` runs and returns `[]`.
    const h = createHarness({ readSet: (k) => (k === "up" ? ["up_t"] : ["down_t"]) });
    const up = h.runtime.defineResource({
      key: "up",
      mode: "push",
      identityTable: "up_t",
      schema: z.number(),
      loader: async () => 1,
    });
    let downValue = [{ id: "d", n: 1 }];
    const downLoads: string[] = [];
    h.runtime.defineResource(
      { key: "down", schema: rowsSchema, keyed: { keyOf } },
      {
        identityTable: "down_t",
        dependsOn: [{ resource: up, affectedMap: () => [] }], // nothing downstream affected
        loader: (_p, c) => {
          downLoads.push(c === undefined ? "FULL" : "scoped");
          return downValue;
        },
      },
    );
    await h.subscribe("up");
    await h.subscribe("down");
    downLoads.length = 0;

    // A scoped change to up_t: `up` recomputes and cascades to `down` with an empty
    // affected set → `down` is skipped.
    h.runtime.applyDbChange({ table: "up_t", op: "U", ids: ["u1"], origin: "up_t", identityBase: "up_t" });
    await tick();

    expect(downLoads).toEqual([]); // loader never ran
    expect(h.pushesFor("down")).toHaveLength(0); // no frame

    // …and the version was NOT bumped. Read it straight from the `_debug` payload:
    // an unbumped pk has no entry in `versions` (bumps happen only in flushNotifies).
    const debug = await h.runtime.handleResourceHttp(
      new Request("http://x/api/resources/_debug"),
      { key: "_debug" },
    );
    const body = (await debug.json()) as { resources: Array<{ key: string; versions: Record<string, number> }> };
    const downRow = body.resources.find((r) => r.key === "down")!;
    expect(downRow.versions).toEqual({}); // never bumped

    // A LATER real (FULL) change to up_t propagates and bumps `down` from base 0 to
    // 1 — proving the empty-scoped no-op left the version untouched (else this
    // would be version 2).
    downValue = [{ id: "d", n: 2 }];
    h.runtime.applyDbChange({ table: "up_t", op: "I", ids: null, origin: "up_t", identityBase: "up_t" });
    await tick();

    expect(downLoads).toEqual(["FULL"]);
    const downPushes = h.pushesFor("down");
    expect(downPushes).toHaveLength(1);
    expect(downPushes[0]!.version).toBe(1);
  });
});
