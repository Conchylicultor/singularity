/**
 * Mutation-ack channel (`ackTx`) on the delta wire. Run with
 * `bun test plugins/framework/plugins/resource-runtime/core/runtime-ack-channel.test.ts`.
 *
 * A feed change carries its source transaction id (`xid`, the change-feed's
 * `pg_current_xact_id()`); the pending coalesces those into `sourceTx`, and the
 * drain stamps `ackTx` — "the source transactions whose rows this recompute
 * folded in" — onto the value frames it produces (`update` / `delta`). A
 * recompute that produces NO value change (empty scoped diff, membership
 * net-zero / window-boundary skip, point empty-intersection) broadcasts a
 * standalone version-less `{ kind: "ack" }` frame instead, gated on the
 * per-resource `ackChannel` opt-in. Pinned here:
 *
 *   - a feed FULL recompute stamps ackTx on the delta/update; hand-`notify()`
 *     and synthetic pushes are structurally ack-less; `invalidate` never
 *     carries one;
 *   - coalescing unions xids into one frame; a scoped→FULL degrade KEEPS the
 *     union (a FULL reads post-commit — contrast `deleted`, which FULL drops);
 *   - the no-value-change paths broadcast `{ kind: "ack" }` iff `ackChannel`,
 *     without bumping the version stream the next real frame ships under;
 *   - the STALE-FLIGHT JOIN: a drain that coalesces onto an in-flight read
 *     (whose SELECT may predate the commit) adopts the STARTER's (absent)
 *     ackTx and ships none — missed ack safe, false ack impossible (mirrors
 *     the etag/watermark co-production);
 *   - loader failure ships neither frame nor ack;
 *   - the SOURCE_TX_CAP overflow suppresses ackTx for the cycle.
 *
 * See research/2026-07-18-global-bounded-working-set-phase2.md Part C.
 */

import { test, expect, describe } from "bun:test";
import { z } from "zod";
import { createHarness, controllable, tick } from "./test-support";

const rowsSchema = z.array(z.object({ id: z.string(), n: z.number() }));
const keyOf = (r: unknown) => (r as { id: string }).id;

// A keyed own-identity resource "rows" over a simulated table, with a feed
// helper carrying the optional `xid` attribution.
function keyedHarness(o: { ackChannel?: true } = {}) {
  const table = new Map<string, number>();
  const rows = () => [...table.entries()].map(([id, n]) => ({ id, n }));
  const h = createHarness({ readSet: () => ["row_table"], sockets: 2 });
  h.runtime.defineResource(
    { key: "rows", schema: rowsSchema, keyed: { keyOf } },
    {
      identityTable: "row_table",
      ...(o.ackChannel ? { ackChannel: true as const } : {}),
      loader: (_p, c) =>
        c ? rows().filter((r) => c.affectedIds.includes(r.id)) : rows(),
    },
  );
  const feed = (op: "I" | "U" | "D", ids: string[] | null, xid?: string) =>
    h.runtime.applyDbChange({
      table: "row_table",
      op,
      ids,
      origin: "row_table",
      identityBase: "row_table",
      ...(xid !== undefined ? { xid } : {}),
    });
  return { h, table, feed };
}

const deltas = (h: ReturnType<typeof createHarness>, key: string) =>
  h.pushesFor(key).filter((f) => f.kind === "delta");
const acks = (h: ReturnType<typeof createHarness>, key: string) =>
  h.pushesFor(key).filter((f) => f.kind === "ack");

describe("ackTx — value frames", () => {
  test("a feed FULL recompute stamps ackTx on the keyed delta; a scoped feed change stamps it on the scoped delta", async () => {
    const k = keyedHarness();
    k.table.set("a", 1);
    await k.h.subscribe("rows");

    // Scoped UPDATE with attribution: the (watermark-less) scoped delta
    // carries the pending's ackTx.
    k.table.set("a", 2);
    k.feed("U", ["a"], "500");
    await tick();
    const scoped = deltas(k.h, "rows").at(-1)!;
    expect(scoped.upserts).toHaveLength(1);
    expect((scoped as { ackTx?: string[] }).ackTx).toEqual(["500"]);

    // FULL (id-less) change: the flight-resolved ackTx rides the FULL delta.
    k.table.set("a", 3);
    k.feed("U", null, "501");
    await tick();
    const full = deltas(k.h, "rows").at(-1)!;
    expect((full as { ackTx?: string[] }).ackTx).toEqual(["501"]);
  });

  test("a feed change without xid (pre-upgrade NOTIFY) ships frames with NO ackTx", async () => {
    const k = keyedHarness();
    k.table.set("a", 1);
    await k.h.subscribe("rows");
    k.table.set("a", 2);
    k.feed("U", ["a"]);
    await tick();
    const scoped = deltas(k.h, "rows").at(-1)!;
    expect(scoped.upserts).toHaveLength(1);
    expect("ackTx" in scoped).toBe(false);
  });

  test("a push-mode update frame from the feed carries ackTx; hand-notify and synthetic pushes never do", async () => {
    const h = createHarness({ readSet: () => ["p_table"] });
    let n = 0;
    const r = h.runtime.defineExternalResource({
      key: "p",
      mode: "push",
      identityTable: "p_table",
      schema: z.number(),
      loader: async () => ++n,
    });
    await h.subscribe("p");

    h.runtime.applyDbChange({
      table: "p_table",
      op: "U",
      ids: null,
      origin: "p_table",
      identityBase: "p_table",
      xid: "600",
    });
    await tick();
    const feedUpdate = h.pushesFor("p").filter((f) => f.kind === "update").at(-1)!;
    expect((feedUpdate as { ackTx?: string[] }).ackTx).toEqual(["600"]);

    // Hand-`notify()`: no HTTP mutation corresponds — structurally ack-less.
    r.notify();
    await tick();
    const handUpdate = h.pushesFor("p").filter((f) => f.kind === "update").at(-1)!;
    expect("ackTx" in handUpdate).toBe(false);

    // Synthetic (debug churn emitter): same.
    h.runtime.triggerResourcePush("p");
    await tick();
    const synthUpdate = h.pushesFor("p").filter((f) => f.kind === "update").at(-1)!;
    expect("ackTx" in synthUpdate).toBe(false);
  });

  test("invalidate frames NEVER carry ackTx (the base does not yet reflect the tx)", async () => {
    const h = createHarness({ readSet: () => ["i_table"] });
    h.runtime.defineExternalResource({
      key: "i",
      mode: "invalidate",
      identityTable: "i_table",
      schema: z.number(),
      loader: async () => 1,
    });
    await h.subscribe("i");
    h.runtime.applyDbChange({
      table: "i_table",
      op: "U",
      ids: null,
      origin: "i_table",
      identityBase: "i_table",
      xid: "700",
    });
    await tick();
    const inv = h.pushesFor("i").filter((f) => f.kind === "invalidate").at(-1)!;
    expect("ackTx" in inv).toBe(false);
  });

  test("sub-ack and the HTTP body never carry ackTx (their snapshot watermark subsumes it)", async () => {
    const k = keyedHarness();
    k.table.set("a", 1);
    await k.h.subscribe("rows");
    const ack = k.h.frames.find((f) => f.kind === "sub-ack")!;
    expect("ackTx" in ack).toBe(false);

    const res = await k.h.runtime.handleResourceHttp(
      new Request("http://localhost/api/resources/rows"),
      { key: "rows" },
    );
    const body = (await res.json()) as Record<string, unknown>;
    expect("ackTx" in body).toBe(false);
  });
});

describe("ackTx — coalescing", () => {
  test("two same-flush xids union into ONE frame carrying both", async () => {
    const k = keyedHarness();
    k.table.set("a", 1);
    k.table.set("b", 1);
    await k.h.subscribe("rows");
    k.table.set("a", 2);
    k.table.set("b", 2);
    k.feed("U", ["a"], "800");
    k.feed("U", ["b"], "801");
    await tick();
    const all = deltas(k.h, "rows");
    expect(all).toHaveLength(1); // coalesced into one flush
    expect([...((all[0] as { ackTx?: string[] }).ackTx ?? [])].sort()).toEqual(["800", "801"]);
  });

  test("a scoped→FULL degrade KEEPS the union (contrast `deleted`, which FULL drops)", async () => {
    // An M5 membership entry so a DELETE populates the pending's `deleted`
    // channel; the id-less follow-up degrades the pk to FULL, which drops
    // `deleted` (the FULL rebuild resolves membership wholesale) but must keep
    // BOTH sourceTx claims — the FULL read is post-commit for both.
    const table = new Map<string, number>();
    const rows = () => [...table.entries()].map(([id, n]) => ({ id, n }));
    const h = createHarness({ readSet: () => ["m_table"] });
    h.runtime.defineResource(
      { key: "m", schema: rowsSchema, keyed: { keyOf } },
      {
        identityTable: "m_table",
        scopedMembership: { orderOf: async () => [...table.keys()] },
        loader: (_p, c) =>
          c ? rows().filter((r) => c.affectedIds.includes(r.id)) : rows(),
      },
    );
    const feed = (op: "I" | "U" | "D", ids: string[] | null, xid: string) =>
      h.runtime.applyDbChange({
        table: "m_table",
        op,
        ids,
        origin: "m_table",
        identityBase: "m_table",
        xid,
      });
    table.set("a", 1);
    table.set("b", 1);
    await h.subscribe("m");

    table.delete("a");
    feed("D", ["a"], "900"); // membership DELETE → `deleted` channel
    table.set("b", 2);
    feed("U", null, "901"); // id-less → degrade the SAME pending to FULL
    await tick();
    const frame = deltas(h, "m").at(-1)!;
    // FULL membership rebuild: the delete shipped via the rebuilt order, and
    // the ackTx union survived the degrade.
    expect(frame.order).toEqual(["b"]);
    expect([...((frame as { ackTx?: string[] }).ackTx ?? [])].sort()).toEqual(["900", "901"]);
  });
});

describe("standalone ack frames — no-value-change recomputes", () => {
  test("an empty scoped diff broadcasts { kind: 'ack' } iff ackChannel — version-less, no value frame", async () => {
    // Opted in: a byte-identical rewrite (the loader returns the same row) diffs
    // to empty — no delta, but the writer's ack ships standalone.
    const optIn = keyedHarness({ ackChannel: true });
    optIn.table.set("a", 1);
    await optIn.h.subscribe("rows");
    optIn.feed("U", ["a"], "1000"); // no byte change
    await tick();
    expect(deltas(optIn.h, "rows")).toHaveLength(0);
    const ack = acks(optIn.h, "rows");
    expect(ack).toHaveLength(1);
    expect((ack[0] as { ackTx?: string[] }).ackTx).toEqual(["1000"]);
    expect("version" in ack[0]!).toBe(false); // version-less by design

    // Not opted in: same recompute ships nothing at all (today's behavior).
    const optOut = keyedHarness();
    optOut.table.set("a", 1);
    await optOut.h.subscribe("rows");
    optOut.feed("U", ["a"], "1001");
    await tick();
    expect(optOut.h.pushesFor("rows")).toHaveLength(0);
  });

  test("point empty-intersection broadcasts an ack to the untouched tuple iff opt-in, with NO version bump", async () => {
    const makePoint = (ackChannel: boolean) => {
      const table = new Map<string, number>();
      const idsOf = (p: Record<string, string>) => (p.ids ?? "").split(",").filter(Boolean);
      const h = createHarness({ readSet: () => ["pt_table"] });
      h.runtime.defineResource(
        { key: "pt", schema: rowsSchema, keyed: { keyOf } },
        {
          identityTable: "pt_table",
          membership: { kind: "point", idsOf },
          ...(ackChannel ? { ackChannel: true as const } : {}),
          loader: (p, c) => {
            const ids = c ? [...c.affectedIds] : idsOf(p);
            return ids.filter((id) => table.has(id)).map((id) => ({ id, n: table.get(id)! }));
          },
        },
      );
      const feed = (op: "I" | "U" | "D", ids: string[] | null, xid?: string) =>
        h.runtime.applyDbChange({
          table: "pt_table",
          op,
          ids,
          origin: "pt_table",
          identityBase: "pt_table",
          ...(xid !== undefined ? { xid } : {}),
        });
      return { h, table, feed };
    };

    const p = makePoint(true);
    p.table.set("a", 1);
    await p.h.subscribe("pt", { ids: "a" });

    // A change entirely OUTSIDE the tuple's id set: value untouched, ack ships.
    p.table.set("z", 9);
    p.feed("U", ["z"], "1100");
    await tick();
    expect(deltas(p.h, "pt")).toHaveLength(0);
    const ack = acks(p.h, "pt");
    expect(ack).toHaveLength(1);
    expect((ack[0] as { ackTx?: string[] }).ackTx).toEqual(["1100"]);
    expect(ack[0]!.params).toEqual({ ids: "a" });

    // The ack-only cycle bumped NO version: the first real change ships at 1.
    p.table.set("a", 2);
    p.feed("U", ["a"], "1101");
    await tick();
    expect(deltas(p.h, "pt").at(-1)!.version).toBe(1);

    // Without the opt-in the empty intersection stays a total no-op.
    const q = makePoint(false);
    q.table.set("a", 1);
    await q.h.subscribe("pt", { ids: "a" });
    q.table.set("z", 9);
    q.feed("U", ["z"], "1102");
    await tick();
    expect(q.h.pushesFor("pt")).toHaveLength(0);
  });

  test("a window-boundary skip (entrant past the tail) broadcasts an ack, with NO version bump", async () => {
    const table = new Map<string, number>(); // id → n; window = 2 smallest n
    const members = () =>
      [...table.entries()]
        .map(([id, n]) => ({ id, n }))
        .sort((a, b) => a.n - b.n || (a.id < b.id ? -1 : 1));
    const h = createHarness({ readSet: () => ["w_table"] });
    h.runtime.defineResource(
      { key: "win", schema: rowsSchema, keyed: { keyOf } },
      {
        identityTable: "w_table",
        ackChannel: true,
        membership: {
          kind: "window",
          windowIdsOf: async () => members().slice(0, 2).map((r) => r.id),
        },
        loader: (_p, c) =>
          c
            ? [...c.affectedIds].filter((id) => table.has(id)).map((id) => ({ id, n: table.get(id)! }))
            : members().slice(0, 2),
      },
    );
    const feed = (op: "I" | "U" | "D", ids: string[] | null, xid: string) =>
      h.runtime.applyDbChange({
        table: "w_table",
        op,
        ids,
        origin: "w_table",
        identityBase: "w_table",
        xid,
      });
    table.set("a", 1);
    table.set("b", 2);
    await h.subscribe("win"); // window [a, b]

    // Entrant sorting PAST the tail: net-zero — no frame, but the ack ships.
    table.set("z", 9);
    feed("I", ["z"], "1200");
    await tick();
    expect(deltas(h, "win")).toHaveLength(0);
    expect((acks(h, "win").at(-1) as { ackTx?: string[] } | undefined)?.ackTx).toEqual(["1200"]);

    // No version was consumed: the first real change ships at version 1.
    table.set("a", 0);
    feed("U", ["a"], "1201");
    await tick();
    expect(deltas(h, "win").at(-1)!.version).toBe(1);
  });

  test("an ack frame reaches only subscribers of the tuple; zero subscribers ⇒ nothing", async () => {
    const k = keyedHarness({ ackChannel: true });
    k.table.set("a", 1);
    await k.h.subscribe("rows", {}, { socket: 0 });
    k.feed("U", ["a"], "1300"); // empty diff → ack
    await tick();
    expect(acks(k.h, "rows").filter((f) => f.socket === 0)).toHaveLength(1);
    expect(acks(k.h, "rows").filter((f) => f.socket === 1)).toHaveLength(0);
  });
});

describe("ackTx — stale-flight join (co-production)", () => {
  test("a drain joining an in-flight READ ships NO ackTx; its own started flight carries it", async () => {
    const ctl = controllable([{ id: "a", n: 1 }]);
    const h = createHarness({ readSet: () => ["c_table"], sockets: 2 });
    h.runtime.defineResource(
      { key: "c", schema: rowsSchema, keyed: { keyOf } },
      { identityTable: "c_table", loader: ctl.loader },
    );
    await h.subscribe("c", {}, { socket: 0 }); // seeds the snapshot

    // Park a READ flight (socket 1's full-path sub), then land a feed change:
    // the drain's FULL load coalesces onto the read flight, whose SELECT may
    // predate the commit — it must adopt the starter's ABSENT seed.
    ctl.block();
    const p = h.subscribe("c", {}, { socket: 1 });
    h.runtime.applyDbChange({
      table: "c_table",
      op: "U",
      ids: null,
      origin: "c_table",
      identityBase: "c_table",
      xid: "1400",
    });
    await tick(); // flush starts; the drain joins the parked flight
    ctl.setValue([{ id: "a", n: 2 }]);
    ctl.release();
    await p;
    await tick();

    const joined = deltas(h, "c").at(-1)!;
    expect(joined.upserts).toHaveLength(1); // the value DID ship
    expect("ackTx" in joined).toBe(false); // …but un-acked (backstop confirms)

    // Contrast: an idle-time FULL change starts its own flight — ackTx rides.
    ctl.setValue([{ id: "a", n: 3 }]);
    h.runtime.applyDbChange({
      table: "c_table",
      op: "U",
      ids: null,
      origin: "c_table",
      identityBase: "c_table",
      xid: "1401",
    });
    await tick();
    expect((deltas(h, "c").at(-1) as { ackTx?: string[] }).ackTx).toEqual(["1401"]);
  });
});

describe("ackTx — failure and overflow", () => {
  test("loader failure ships neither a frame nor an ack (no false ack)", async () => {
    const h = createHarness({ readSet: () => ["f_table"] });
    let boom = false;
    h.runtime.defineResource(
      { key: "f", schema: rowsSchema, keyed: { keyOf } },
      {
        identityTable: "f_table",
        ackChannel: true,
        loader: async () => {
          if (boom) throw new Error("loader boom");
          return [{ id: "a", n: 1 }];
        },
      },
    );
    await h.subscribe("f");
    boom = true;
    h.runtime.applyDbChange({
      table: "f_table",
      op: "U",
      ids: ["a"],
      origin: "f_table",
      identityBase: "f_table",
      xid: "1500",
    });
    await tick();
    expect(h.pushesFor("f")).toHaveLength(0);
  });

  test("crossing the sourceTx cap (64) suppresses ackTx for the whole cycle", async () => {
    const k = keyedHarness({ ackChannel: true });
    k.table.set("a", 1);
    await k.h.subscribe("rows");
    k.table.set("a", 2); // real byte change → a delta ships
    for (let i = 0; i < 65; i++) k.feed("U", ["a"], `${2000 + i}`);
    await tick();
    const frame = deltas(k.h, "rows").at(-1)!;
    expect(frame.upserts).toHaveLength(1); // the value frame is untouched
    expect("ackTx" in frame).toBe(false); // a torn set is worse than none
    expect(acks(k.h, "rows")).toHaveLength(0); // suppression covers the ack frame too
  });
});
