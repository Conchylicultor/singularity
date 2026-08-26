/**
 * `rowIdentity` — the routing-only answer to "which subscribed tuple owns this
 * changed row?", from
 * `research/2026-08-25-global-own-row-resource-scoping.md`. Run with
 * `./singularity test plugins/framework/plugins/resource-runtime`.
 *
 * The shape under test is the one-row-per-tuple resource (`page-block-doc`,
 * `todo-block-task`): params `{ id }`, value a 0-or-1-row array, loader `where
 * id = params.id` — which IGNORES `ctx.affectedIds` outright, because its read is
 * already that one row. Without `rowIdentity` the feed schedules a recompute on
 * EVERY subscribed tuple, each of which re-reads its own row, finds the changed
 * row is not its own, and diffs to empty. No frame ships from those tuples, which
 * is exactly what hid the cost for months — so every test here asserts the LOADER
 * CALL COUNT, not just the absent frame.
 *
 * Pinned here:
 *
 *   - U / I / D on one id are scheduled for that id's tuple ONLY, and the other
 *     tuple's loader never runs;
 *   - the equivalence property (the most important one): with and without
 *     `rowIdentity`, the OWNING tuple's frame stream is deep-equal — the only
 *     behavioural change is that non-owning tuples are not scheduled;
 *   - `ids: null` (a bulk/over-cap statement) still reaches every tuple, FULL;
 *   - a change on an UNCOVERED read-set table (a FOREIGN key space) is NEVER
 *     filtered — the `identityOrigin` gate, which is the whole correctness
 *     argument and is invisible in the code;
 *   - a change arriving via a SECONDARY view is still dropped;
 *   - zero subscribers ⇒ no `{}` pending (contrast: the fan-out twin bumps it);
 *   - registration guards: keyed + identityTable required, mutually exclusive
 *     with membership / scopedMembership, incompatible with bootCritical;
 *   - a throwing `rowIdentity` fails OPEN (delivered anyway) and is reported;
 *   - an `ackChannel` entry still acks a writer whose change missed its tuple;
 *   - the registration guards double as the proof that `ScopePolicy` rejects
 *     two arms at once: each carries a `@ts-expect-error` over its `toThrow`, so
 *     one test pins the compile-time rejection AND the runtime backstop;
 *   - and, at the foot of the file, the one case no guard test can express — an
 *     `identityTable` with NO arm, which no runtime guard rejects because it was
 *     the legal default until now.
 */

import { test, expect, describe } from "bun:test";
import { z } from "zod";
import { createHarness, tick } from "./test-support";
import type { ResourceParams } from "./runtime";

const rowsSchema = z.array(z.object({ id: z.string(), n: z.number() }));
const keyOf = (r: unknown) => (r as { id: string }).id;

interface OwnRowOpts {
  rowIdentity?: boolean;
  ackChannel?: true;
}

// One simulated identity table (`blk_table`, whose PK IS the resource's row key)
// plus any number of resources over it, each recording every loader run as
// `key:FULL|scoped:id` so a test can see both WHO was asked and HOW.
// `blk_view` is a secondary view onto the same base; `other_table` is an
// uncovered read-set dependency, whose ids live in a foreign key space.
function ownRowHarness(runtimeOpts: Parameters<typeof createHarness>[0] = {}) {
  const table = new Map<string, number>();
  const loaderCalls: string[] = [];
  const h = createHarness({
    readSet: () => ["blk_table", "blk_view", "other_table"],
    sockets: 2,
    ...runtimeOpts,
  });
  // The two shapes are spelled OUT, not merged behind a conditional spread,
  // because `ScopePolicy` is a union: the twin without `rowIdentity` has to name
  // the arm it does take, and that arm is `fanOut` — which is precisely what the
  // equivalence test below compares against.
  const define = (key: string, o: OwnRowOpts = {}): void => {
    const contract = { key, schema: rowsSchema, keyed: { keyOf } };
    const rest = {
      ...(o.ackChannel ? { ackChannel: o.ackChannel } : {}),
      loader: (p: ResourceParams, ctx?: { affectedIds: readonly string[] }) => {
        const id = p.id ?? "";
        loaderCalls.push(`${key}:${ctx ? "scoped" : "FULL"}:${id}`);
        const n = table.get(id);
        return n === undefined ? [] : [{ id, n }];
      },
    };
    if (o.rowIdentity) {
      h.runtime.defineResource(contract, {
        identityTable: "blk_table",
        rowIdentity: (p: ResourceParams) => p.id ?? "",
        ...rest,
      });
    } else {
      h.runtime.defineResource(contract, {
        identityTable: "blk_table",
        fanOut: { reason: "the fan-out twin this suite compares against" },
        ...rest,
      });
    }
  };
  const feed = (
    op: "I" | "U" | "D",
    ids: string[] | null,
    o: {
      table?: string;
      origin?: string;
      identityBase?: string;
      xid?: string;
    } = {},
  ): void =>
    h.runtime.applyDbChange({
      table: o.table ?? "blk_table",
      op,
      ids,
      origin: o.origin ?? "blk_table",
      identityBase: o.identityBase ?? "blk_table",
      ...(o.xid !== undefined ? { xid: o.xid } : {}),
    });
  return { h, table, loaderCalls, define, feed };
}

// The per-pk version counters off the `_debug` payload. An unbumped pk has NO
// entry (bumps happen only in flushNotifies), so this reads both "did a `{}`
// pending exist?" and "did a no-op bump the version?".
async function versionsOf(
  h: ReturnType<typeof createHarness>,
  key: string,
): Promise<Record<string, number>> {
  const res = await h.runtime.handleResourceHttp(
    new Request("http://x/api/resources/_debug"),
    { key: "_debug" },
  );
  const body = (await res.json()) as {
    resources: Array<{ key: string; versions: Record<string, number> }>;
  };
  return body.resources.find((r) => r.key === key)!.versions;
}

describe("rowIdentity — routing", () => {
  test("an UPDATE on one id is scheduled for that id's tuple only — the other tuple's LOADER never runs", async () => {
    const w = ownRowHarness();
    w.define("own", { rowIdentity: true });
    w.table.set("a", 1);
    w.table.set("b", 1);
    await w.h.subscribe("own", { id: "a" }, { socket: 0 });
    await w.h.subscribe("own", { id: "b" }, { socket: 1 });
    w.loaderCalls.length = 0;

    w.table.set("a", 9);
    w.feed("U", ["a"]);
    await tick();

    // The whole point: `b` was not asked. The absent frame below was always
    // true — the read was the cost.
    expect(w.loaderCalls).toEqual(["own:scoped:a"]);
    const pushes = w.h.pushesFor("own");
    expect(pushes).toHaveLength(1);
    expect(pushes[0]!.socket).toBe(0);
    expect(pushes[0]!.upserts).toEqual([["a", { id: "a", n: 9 }]]);
    expect(w.h.pushesFor("own", 1)).toEqual([]);
  });

  test("an INSERT on one id reaches only that id's tuple, as a FULL recompute", async () => {
    const w = ownRowHarness();
    w.define("own", { rowIdentity: true });
    w.table.set("b", 1);
    await w.h.subscribe("own", { id: "a" }, { socket: 0 }); // no row yet
    await w.h.subscribe("own", { id: "b" }, { socket: 1 });
    w.loaderCalls.length = 0;

    w.table.set("a", 5);
    w.feed("I", ["a"]);
    await tick();

    // FULL, not scoped: a non-membership entry keeps the pre-M5 INSERT semantics.
    expect(w.loaderCalls).toEqual(["own:FULL:a"]);
    const pushes = w.h.pushesFor("own");
    expect(pushes).toHaveLength(1);
    expect(pushes[0]!.socket).toBe(0);
    expect(pushes[0]!.upserts).toEqual([["a", { id: "a", n: 5 }]]);
    expect(w.h.pushesFor("own", 1)).toEqual([]);
  });

  test("a DELETE on one id reaches only that id's tuple, as a FULL recompute", async () => {
    const w = ownRowHarness();
    w.define("own", { rowIdentity: true });
    w.table.set("a", 1);
    w.table.set("b", 1);
    await w.h.subscribe("own", { id: "a" }, { socket: 0 });
    await w.h.subscribe("own", { id: "b" }, { socket: 1 });
    w.loaderCalls.length = 0;

    w.table.delete("a");
    w.feed("D", ["a"]);
    await tick();

    expect(w.loaderCalls).toEqual(["own:FULL:a"]);
    const pushes = w.h.pushesFor("own");
    expect(pushes).toHaveLength(1);
    expect(pushes[0]!.socket).toBe(0);
    expect(pushes[0]!.deletes).toEqual(["a"]);
    expect(w.h.pushesFor("own", 1)).toEqual([]);
  });

  test("the owning tuple's frame stream is IDENTICAL with and without rowIdentity", async () => {
    // The equivalence property, as a test rather than a comment: `rowIdentity`
    // narrows WHO is scheduled and changes nothing about WHAT the owner gets.
    // Two resources over the same table, one declaring it and one not, each with
    // the same two subscribed tuples — so the fan-out twin really does have a
    // second tuple to fan out to.
    const w = ownRowHarness();
    w.define("own", { rowIdentity: true });
    w.define("fan");
    w.table.set("a", 1);
    w.table.set("b", 1);
    await w.h.subscribe("own", { id: "a" }, { socket: 0 });
    await w.h.subscribe("fan", { id: "a" }, { socket: 0 });
    await w.h.subscribe("own", { id: "b" }, { socket: 1 });
    await w.h.subscribe("fan", { id: "b" }, { socket: 1 });
    w.loaderCalls.length = 0; // drop the four sub-ack loads

    w.table.set("a", 2);
    w.feed("I", ["a"]);
    await tick();
    w.table.set("a", 3);
    w.feed("U", ["a"]);
    await tick();
    w.table.delete("a");
    w.feed("D", ["a"]);
    await tick();
    w.table.set("a", 4);
    w.feed("U", null); // bulk / over-cap: FULL to everyone, both ways
    await tick();

    // Compare EVERY field of every frame, minus the two the harness synthesizes
    // and the resource key itself — so a field one path stamps and the other does
    // not (a watermark, an etag, an order) fails this rather than slipping past a
    // hand-written list.
    const stream = (key: string) =>
      w.h.pushesFor(key, 0).map((f) => {
        const rest: Record<string, unknown> = { ...f };
        delete rest.seq;
        delete rest.socket;
        delete rest.key;
        return rest;
      });
    expect(stream("own")).toEqual(stream("fan"));
    expect(stream("own").length).toBeGreaterThan(0);

    // …and the fan-out twin paid for `b` on every one of those changes, while
    // the rowIdentity one paid only for the bulk statement.
    expect(w.loaderCalls.filter((c) => c === "fan:FULL:b").length).toBe(3);
    expect(w.loaderCalls.filter((c) => c === "fan:scoped:b").length).toBe(1);
    expect(
      w.loaderCalls.filter((c) => c.startsWith("own:") && c.endsWith(":b")),
    ).toEqual(["own:FULL:b"]);
  });

  test("an id-less (bulk / over-cap) change still reaches EVERY subscribed tuple, FULL", async () => {
    // The ~7000-byte NOTIFY cap drops the ids to NULL on a big cascade delete;
    // with no ids there is nothing to intersect, so this is today's behaviour by
    // construction — and it must stay that way.
    const w = ownRowHarness();
    w.define("own", { rowIdentity: true });
    w.table.set("a", 1);
    w.table.set("b", 1);
    await w.h.subscribe("own", { id: "a" }, { socket: 0 });
    await w.h.subscribe("own", { id: "b" }, { socket: 1 });
    w.loaderCalls.length = 0;

    w.table.set("a", 7);
    w.table.set("b", 7);
    w.feed("D", null);
    await tick();

    expect(w.loaderCalls.sort()).toEqual(["own:FULL:a", "own:FULL:b"]);
    expect(w.h.pushesFor("own", 0)).toHaveLength(1);
    expect(w.h.pushesFor("own", 1)).toHaveLength(1);
  });

  test("a change on an UNCOVERED read-set table is never filtered by rowIdentity", async () => {
    // The `identityOrigin` gate. This arm's `change.ids` live in a FOREIGN key
    // space (some other table's PKs), so intersecting an own-row id against them
    // would silently drop every delivery — no error, no frame, no counter. A
    // refactor that reuses `affected !== null` as the filter condition (the shape
    // the point-membership code uses) reintroduces exactly that, and this test is
    // the only thing standing in front of it.
    const w = ownRowHarness();
    w.define("own", { rowIdentity: true });
    w.table.set("a", 1);
    w.table.set("b", 1);
    await w.h.subscribe("own", { id: "a" }, { socket: 0 });
    await w.h.subscribe("own", { id: "b" }, { socket: 1 });
    w.loaderCalls.length = 0;

    w.table.set("a", 2);
    w.table.set("b", 2);
    w.feed("U", ["foreign-1"], {
      table: "other_table",
      origin: "other_table",
      identityBase: "other_table",
    });
    await tick();

    expect(w.loaderCalls.sort()).toEqual(["own:FULL:a", "own:FULL:b"]);
    expect(w.h.pushesFor("own", 0)).toHaveLength(1);
    expect(w.h.pushesFor("own", 1)).toHaveLength(1);
  });

  test("a change arriving via a SECONDARY view is still dropped", async () => {
    // Pre-existing: the identity view is the authoritative path, and a duplicate
    // arriving via another view must not absorb it. `rowIdentity` records its
    // routing ids strictly AFTER that guard, so it cannot resurrect the duplicate.
    const w = ownRowHarness();
    w.define("own", { rowIdentity: true });
    w.table.set("a", 1);
    await w.h.subscribe("own", { id: "a" }, { socket: 0 });
    w.loaderCalls.length = 0;

    w.table.set("a", 2);
    w.feed("U", ["a"], {
      table: "blk_view",
      origin: "blk_table",
      identityBase: "blk_view",
    });
    await tick();

    expect(w.loaderCalls).toEqual([]);
    expect(w.h.pushesFor("own")).toEqual([]);
  });

  test("zero subscribers ⇒ no `{}` pending (the fan-out twin creates one)", async () => {
    // A rowIdentity entry never falls back to the `{}` tuple: its params ARE one
    // row id, so `{}` names no row.
    const w = ownRowHarness();
    w.define("own", { rowIdentity: true });
    w.define("fan");
    w.table.set("a", 1);

    w.feed("U", ["a"]);
    await tick();

    expect(w.loaderCalls).toEqual([]); // neither has a subscriber to serve
    expect(await versionsOf(w.h, "own")).toEqual({});
    expect(await versionsOf(w.h, "fan")).toEqual({ "{}": 1 });
  });

  test("a throwing rowIdentity fails OPEN — the delivery still happens, and it is reported", async () => {
    // It runs on the hot router path inside `applyDbChange`'s swallowing catch:
    // a throw escaping here would abort the whole change, dropping EVERY delivery
    // for it across every resource. So the failure direction is "deliver anyway".
    const reports: string[] = [];
    const w = ownRowHarness({ reportError: (ctx) => reports.push(ctx) });
    w.h.runtime.defineResource(
      { key: "boom", schema: rowsSchema, keyed: { keyOf } },
      {
        identityTable: "blk_table",
        rowIdentity: () => {
          throw new Error("rowIdentity blew up");
        },
        loader: (p: ResourceParams) => {
          const id = p.id ?? "";
          w.loaderCalls.push(`boom:${id}`);
          const n = w.table.get(id);
          return n === undefined ? [] : [{ id, n }];
        },
      },
    );
    w.table.set("a", 1);
    w.table.set("b", 1);
    await w.h.subscribe("boom", { id: "a" }, { socket: 0 });
    await w.h.subscribe("boom", { id: "b" }, { socket: 1 });
    w.loaderCalls.length = 0;

    w.table.set("a", 2);
    w.feed("U", ["a"]);
    await tick();

    // Both tuples were scheduled (today's fan-out), and both throws were reported.
    expect(w.loaderCalls.sort()).toEqual(["boom:a", "boom:b"]);
    expect(reports).toEqual([
      "rowIdentity failed for boom",
      "rowIdentity failed for boom",
    ]);
    expect(w.h.pushesFor("boom", 0)).toHaveLength(1); // the real change shipped
  });

  test("ackChannel: a change that missed this tuple still acks the writer — one standalone ack, no version bump, no delta", async () => {
    const w = ownRowHarness();
    w.define("own", { rowIdentity: true, ackChannel: true });
    w.table.set("a", 1);
    w.table.set("b", 1);
    await w.h.subscribe("own", { id: "a" }, { socket: 0 });
    await w.h.subscribe("own", { id: "b" }, { socket: 1 });
    w.loaderCalls.length = 0;

    w.table.set("a", 2);
    w.feed("U", ["a"], { xid: "tx1" });
    await tick();

    // `b`'s tuple: exactly one frame, an ack, version-less and value-less — an
    // optimistic client subscribed there may hold a pending op whose write
    // landed on another row, and its confirmation must not hang on that.
    const bFrames = w.h.pushesFor("own", 1);
    expect(bFrames).toHaveLength(1);
    expect(bFrames[0]!.kind).toBe("ack");
    expect("version" in bFrames[0]!).toBe(false);
    expect((bFrames[0] as { ackTx?: string[] }).ackTx).toEqual(["tx1"]);
    expect(bFrames[0]!.params).toEqual({ id: "b" });
    expect(w.loaderCalls).toEqual(["own:scoped:a"]); // still no read for `b`
    expect(await versionsOf(w.h, "own")).toEqual({ '{"id":"a"}': 1 });

    // …and `b`'s next REAL change is version 1, proving the ack left the counter
    // where it was.
    w.table.set("b", 3);
    w.feed("U", ["b"], { xid: "tx2" });
    await tick();
    const after = w.h.pushesFor("own", 1);
    expect(after).toHaveLength(2);
    expect(after[1]!.kind).toBe("delta");
    expect(after[1]!.version).toBe(1);
  });

  test("without the ackChannel opt-in, a change that missed this tuple is a TOTAL no-op", async () => {
    const w = ownRowHarness();
    w.define("own", { rowIdentity: true });
    w.table.set("a", 1);
    w.table.set("b", 1);
    await w.h.subscribe("own", { id: "a" }, { socket: 0 });
    await w.h.subscribe("own", { id: "b" }, { socket: 1 });

    w.table.set("a", 2);
    w.feed("U", ["a"], { xid: "tx1" });
    await tick();

    expect(w.h.pushesFor("own", 1)).toEqual([]);
  });
});

describe("rowIdentity — registration guards", () => {
  test("rowIdentity requires keyed mode", () => {
    const h = createHarness();
    expect(() =>
      h.runtime.defineResource({
        key: "bad1",
        mode: "push",
        schema: z.number(),
        identityTable: "t",
        // @ts-expect-error — rowIdentity is not on the non-keyed input form
        rowIdentity: () => "x",
        loader: async () => 1,
      }),
    ).toThrow(/rowIdentity requires mode "keyed"/);
  });

  test("rowIdentity requires an identityTable", () => {
    const h = createHarness();
    expect(() =>
      // The four-arm `ScopePolicy` rejects this combination at compile time, which
      // is the point: `@ts-expect-error` FAILS if it ever stops being rejected, so
      // the directive pins the type's behaviour as a test. The runtime guard below
      // is the backstop for a caller who casts past the type.
      // @ts-expect-error — `recompute` and `rowIdentity` are different arms — a FULL opt-out has no identity table to own a row of
      h.runtime.defineResource(
        { key: "bad2", schema: rowsSchema, keyed: { keyOf } },
        {
          recompute: { kind: "full", reason: "test" },
          rowIdentity: (p: ResourceParams) => p.id ?? "",
          loader: async () => [],
        },
      ),
    ).toThrow(/rowIdentity requires an identityTable/);
  });

  test("rowIdentity and membership are mutually exclusive", () => {
    const h = createHarness();
    expect(() =>
      // The four-arm `ScopePolicy` rejects this combination at compile time, which
      // is the point: `@ts-expect-error` FAILS if it ever stops being rejected, so
      // the directive pins the type's behaviour as a test. The runtime guard below
      // is the backstop for a caller who casts past the type.
      // @ts-expect-error — `membership` and `rowIdentity` are mutually exclusive arms
      h.runtime.defineResource(
        { key: "bad3", schema: rowsSchema, keyed: { keyOf } },
        {
          identityTable: "t",
          membership: {
            kind: "point",
            idsOf: (p: ResourceParams) => [p.id ?? ""],
          },
          rowIdentity: (p: ResourceParams) => p.id ?? "",
          loader: async () => [],
        },
      ),
    ).toThrow(/rowIdentity and membership are mutually exclusive/);
  });

  test("rowIdentity and scopedMembership are mutually exclusive", () => {
    const h = createHarness();
    expect(() =>
      // The four-arm `ScopePolicy` rejects this combination at compile time, which
      // is the point: `@ts-expect-error` FAILS if it ever stops being rejected, so
      // the directive pins the type's behaviour as a test. The runtime guard below
      // is the backstop for a caller who casts past the type.
      // @ts-expect-error — `scopedMembership` and `rowIdentity` are mutually exclusive arms
      h.runtime.defineResource(
        { key: "bad4", schema: rowsSchema, keyed: { keyOf } },
        {
          identityTable: "t",
          scopedMembership: { orderOf: async () => [] },
          rowIdentity: (p: ResourceParams) => p.id ?? "",
          loader: async () => [],
        },
      ),
    ).toThrow(/rowIdentity and scopedMembership are mutually exclusive/);
  });

  test("rowIdentity is incompatible with bootCritical", () => {
    // A persisted entry is recomputed at the `{}` tuple by the L2 boot init and
    // `recomputeResource`, for which `rowIdentity({})` names no row.
    const h = createHarness();
    expect(() =>
      h.runtime.defineResource(
        {
          key: "bad5",
          schema: rowsSchema,
          keyed: { keyOf },
          bootCritical: true,
        },
        {
          identityTable: "t",
          rowIdentity: (p: ResourceParams) => p.id ?? "",
          loader: async () => [],
        },
      ),
    ).toThrow(/rowIdentity is incompatible with bootCritical/);
  });
});

// ── `ScopePolicy`: the ONE case no guard test can express ──────────
//
// The registration-guard tests above (and their twins in
// `runtime-scoped-membership` / `runtime-window-membership`) already pin every
// TWO-ARMS-AT-ONCE rejection, each with a `@ts-expect-error` over a runtime
// `toThrow` — a strictly better mechanism, because it asserts the compile-time
// rejection AND the runtime backstop in one test. The five arms' positive
// spellings are exercised by real call sites.
//
// What none of them can express is the shape this whole change exists to
// delete: an `identityTable` with NO arm, which was the legal default until
// now, so no runtime guard rejects it and no `toThrow` can be written for it.
// `fanOut` likewise changes NOTHING at runtime — that is the point of the arm —
// so only `tsc` can hold the requirement, and only this fixture can hold that
// `tsc` does. `@ts-expect-error` fails if the rejection ever stops happening.
//
// Never called; exported only so it is not dead code.
export function scopePolicyMissingArmFixture(
  h: ReturnType<typeof createHarness>,
): void {
  const contract = { key: "fixture", schema: rowsSchema, keyed: { keyOf } };
  // @ts-expect-error — identityTable with no rowIdentity / membership / scopedMembership / fanOut
  h.runtime.defineResource(contract, {
    identityTable: "t",
    loader: async () => [],
  });
}
