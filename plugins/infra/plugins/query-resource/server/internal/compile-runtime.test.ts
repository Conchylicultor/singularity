/**
 * End-to-end tests: a compiled query-resource wired into a real
 * `createResourceRuntime` with a fake WS, exercising the L4 change-feed
 * (`applyDbChange`) → keyed-diff → wire-frame path. Mirrors the fake-ws harness
 * in `resource-runtime/core/runtime.test.ts`. No live DB — `spec.db` is a fake
 * returning scripted rows, so the compiled loader runs entirely in-memory.
 *
 * Run: `bun test plugins/infra/plugins/query-resource/server/internal/compile-runtime.test.ts`
 */

import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { integer, pgTable, text } from "drizzle-orm/pg-core";
import {
  createResourceRuntime,
  type KeyedResourceContract,
  type ResourceParams,
  type ScopePolicy,
  type ServerResourceOptions,
} from "@plugins/framework/plugins/resource-runtime/core";
import { compileEdges, compileQuery } from "./compile";
import { rel } from "./rel";
import type { QueryDb, SelectMap } from "./spec";

const rows = pgTable("rows", {
  id: text("id").primaryKey(),
  n: integer("n").notNull(),
});

// The tasks/attempts/tasks cascade shape, in miniature: conversations own an
// `attemptId`, attempts own a `taskId`. `rel()` edges chain a `selectDistinct`
// per hop to translate conv ids → attempt ids → task ids (the fake db scripts
// each hop's result — see `fakeDb`'s `distinct` arg).
const convs = pgTable("convs", {
  id: text("id").primaryKey(),
  attemptId: text("attempt_id").notNull(),
  n: integer("n").notNull(),
});
const attemptsT = pgTable("attempts_t", {
  id: text("id").primaryKey(),
  taskId: text("task_id").notNull(),
  n: integer("n").notNull(),
});
const tasksT = pgTable("tasks_t", {
  id: text("id").primaryKey(),
  n: integer("n").notNull(),
});

// A fake db whose scripted rows depend on whether the query is scoped. The
// scoped refill is the only `select()` path that calls `.where()` (the compiler
// adds `pk IN (...)`), so the fake flips to "scoped" on the first `.where()`.
// Full loads return the whole set; scoped loads return only the "changed" rows.
//
// `distinct` scripts the `selectDistinct(...).from(...).where(...)` path a
// compiled `rel()` edge's `affectedMap` drives — one call per hop, returning the
// hop's distinct `{ v }` rows (the mapped downstream ids). It defaults to `[]`
// (edge-free resources never call it). No SQL is rendered here — that is covered
// by compile.test.ts.
function fakeDb(
  full: () => unknown[],
  scopedRows: () => unknown[],
  distinct: () => unknown[] = () => [],
): QueryDb {
  const step = (scoped: boolean) => ({
    where: () => step(true),
    orderBy: () => step(scoped),
    limit: () => step(scoped),
    then: (resolve: (v: unknown[]) => unknown) =>
      Promise.resolve(scoped ? scopedRows() : full()).then(resolve),
  });
  // A `selectDistinct` hop: `.from(via).where(from IN ids)` then await.
  const distinctStep = () => ({
    where: () => distinctStep(),
    then: (resolve: (v: unknown[]) => unknown) =>
      Promise.resolve(distinct()).then(resolve),
  });
  const from = { from: () => step(false) };
  const distinctFrom = { from: () => distinctStep() };
  return {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    select: (_fields?: SelectMap) => from,
    selectDistinct: () => distinctFrom,
  } as unknown as QueryDb;
}

interface SentFrame {
  seq: number;
  key: string;
  kind: string;
  version?: number;
  // Keyed-delta payload fields, captured for the M5 membership assertions
  // (present only on `delta` frames).
  upserts?: [string, unknown][];
  deletes?: string[];
  order?: string[];
}

function harness(readSetMap: Record<string, string[]>) {
  const runtime = createResourceRuntime({ readSet: (key) => readSetMap[key] ?? [] });
  const frames: SentFrame[] = [];
  let seq = 0;
  const ws = {
    send(raw: string) {
      const msg = JSON.parse(raw) as {
        kind: string;
        key?: string;
        version?: number;
        upserts?: [string, unknown][];
        deletes?: string[];
        order?: string[];
      };
      if (msg.kind === "ping") return;
      frames.push({
        seq: seq++,
        key: msg.key ?? "",
        kind: msg.kind,
        version: msg.version,
        upserts: msg.upserts,
        deletes: msg.deletes,
        order: msg.order,
      });
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handler = runtime.notificationsWsHandler as any;
  handler.open(ws);
  return {
    runtime,
    frames,
    async subscribe(key: string, params: ResourceParams = {}) {
      handler.message(ws, JSON.stringify({ op: "sub", key, params }));
      await new Promise((r) => setTimeout(r, 0));
    },
    pushesFor(key: string) {
      return frames.filter((f) => f.key === key && f.kind !== "sub-ack");
    },
  };
}

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
const rowSchema = z.array(z.object({ id: z.string(), n: z.number() }));
const keyed = (key: string): KeyedResourceContract<{ id: string; n: number }[]> => ({
  key,
  schema: rowSchema,
  keyed: { keyOf: (r) => (r as { id: string }).id },
});

// Register a compiled spec into the runtime under `key`, wrapping the loader so
// the test can observe whether each post-subscribe load was scoped (`ctx`).
function register(
  runtime: ReturnType<typeof createResourceRuntime>,
  key: string,
  spec: Parameters<typeof compileQuery>[0],
  loads: boolean[],
  subscribed: () => boolean,
  idsSeen?: (readonly string[] | undefined)[],
) {
  const { serverOpts } = compileQuery(spec);
  const inner = serverOpts.loader;
  const wrapped = {
    ...serverOpts,
    loader: (p: ResourceParams, ctx?: { affectedIds: readonly string[] }) => {
      if (subscribed()) {
        loads.push(ctx !== undefined);
        idsSeen?.push(ctx?.affectedIds);
      }
      return inner(p, ctx);
    },
  } as ServerResourceOptions<{ id: string; n: number }[]> & ScopePolicy;
  return runtime.defineResource(keyed(key), wrapped);
}

describe("compiled query-resource — end-to-end via the change-feed", () => {
  test("sub-ack ships the full array; a scoped UPDATE ships one keyed delta (no order)", async () => {
    const h = harness({ rows: ["rows"] });
    const loads: boolean[] = [];
    let subscribed = false;
    register(
      h.runtime,
      "rows",
      { from: rows, identity: { pk: rows.id }, db: fakeDb(() => [{ id: "a", n: 1 }, { id: "b", n: 1 }], () => [{ id: "a", n: 2 }]) },
      loads,
      () => subscribed,
    );
    await h.subscribe("rows");
    subscribed = true;

    h.runtime.applyDbChange({ table: "rows", op: "U", ids: ["a"], origin: "rows", identityBase: "rows" });
    await tick();

    const pushes = h.pushesFor("rows");
    expect(pushes).toHaveLength(1);
    expect(pushes[0]!.kind).toBe("delta"); // scoped in-place upsert, no order asserted
    expect(loads).toEqual([true]); // loader ran scoped
  });

  test("identityBase mismatch is dropped (secondary-view FULL cannot absorb the scoped path)", async () => {
    const h = harness({ rows: ["rows"] });
    const loads: boolean[] = [];
    let subscribed = false;
    register(
      h.runtime,
      "rows",
      { from: rows, identity: { pk: rows.id }, db: fakeDb(() => [{ id: "a", n: 1 }], () => [{ id: "a", n: 2 }]) },
      loads,
      () => subscribed,
    );
    await h.subscribe("rows");
    subscribed = true;

    // origin === identityTable but identityBase !== identityTable ⇒ dropped.
    h.runtime.applyDbChange({ table: "rows", op: "U", ids: ["a"], origin: "rows", identityBase: "other" });
    await tick();

    expect(h.pushesFor("rows")).toHaveLength(0);
    expect(loads).toEqual([]);
  });

  // The mutable-where membership hazard, pinned end-to-end (see the CLAUDE.md
  // rule): under K/scoped, a row that stops matching the `where` is NOT deleted
  // from the snapshot — the scoped load comes back empty, diffKeyedScoped never
  // emits deletes, NO frame is sent, and the client stays stale. This is exactly
  // why a mutable-column `where` must declare `recompute: {kind:"full"}` (the
  // where-flip test below ships the disappearance as a real FULL-diffed delta).
  test("an empty scoped result sends no frame", async () => {
    const h = harness({ rows: ["rows"] });
    const loads: boolean[] = [];
    let subscribed = false;
    register(
      h.runtime,
      "rows",
      { from: rows, identity: { pk: rows.id }, db: fakeDb(() => [{ id: "a", n: 1 }], () => []) },
      loads,
      () => subscribed,
    );
    await h.subscribe("rows");
    subscribed = true;

    h.runtime.applyDbChange({ table: "rows", op: "U", ids: ["a"], origin: "rows", identityBase: "rows" });
    await tick();

    expect(h.pushesFor("rows")).toHaveLength(0); // empty scoped diff ⇒ no send
    expect(loads).toEqual([true]); // it did run scoped, just yielded nothing
  });

  test("recompute:full always FULL-recomputes (ignores affectedIds)", async () => {
    const h = harness({ rows: ["rows"] });
    const loads: boolean[] = [];
    let subscribed = false;
    // No identityTable (recompute policy), so the change is not provably this
    // resource's keys ⇒ FULL. The loader must run WITHOUT ctx.
    register(
      h.runtime,
      "rows",
      {
        from: rows,
        identity: { pk: rows.id },
        recompute: { kind: "full", reason: "windowed read" },
        db: fakeDb(() => [{ id: "a", n: 2 }, { id: "b", n: 1 }], () => [{ id: "a", n: 99 }]),
      },
      loads,
      () => subscribed,
    );
    await h.subscribe("rows");
    subscribed = true;

    h.runtime.applyDbChange({ table: "rows", op: "U", ids: ["a"], origin: "rows", identityBase: "rows" });
    await tick();

    expect(loads).toEqual([false]); // FULL recompute (no scoped ctx)
    expect(h.pushesFor("rows").length).toBeGreaterThanOrEqual(1);
  });

  test("K/full where-filtered: a row flipping out of the where ships a FULL-diffed delta (deletion reaches the client)", async () => {
    const h = harness({ rows: ["rows"] });
    const loads: boolean[] = [];
    let subscribed = false;
    // Simulates notifications' `dismissed = false` filter: the sub-ack sees
    // {a, b}; after the UPDATE flips a's where-column, the FULL query returns
    // only {b}. Under the mandated recompute:full policy the loader re-runs the
    // whole query and diffKeyedFull ships a's disappearance as a real delta —
    // the correctness property K/scoped cannot provide (previous test).
    let flipped = false;
    register(
      h.runtime,
      "rows",
      {
        from: rows,
        identity: { pk: rows.id },
        recompute: { kind: "full", reason: "where-filtered membership (test)" },
        db: fakeDb(
          () => (flipped ? [{ id: "b", n: 1 }] : [{ id: "a", n: 1 }, { id: "b", n: 1 }]),
          () => [],
        ),
      },
      loads,
      () => subscribed,
    );
    await h.subscribe("rows");
    subscribed = true;
    flipped = true; // the UPDATE below flipped `a` out of the result set

    h.runtime.applyDbChange({ table: "rows", op: "U", ids: ["a"], origin: "rows", identityBase: "rows" });
    await tick();

    const pushes = h.pushesFor("rows");
    expect(loads).toEqual([false]); // FULL recompute, never scoped
    expect(pushes).toHaveLength(1); // the disappearance SHIPS (delta with delete+order)
    expect(pushes[0]!.kind).toBe("delta");
  });
});

// The derived-cascade end-to-end: `rel()` edges (single- and multi-hop, plus the
// signature relevance gate) driving the real change-feed → keyed-diff path. These
// pin the tasks/attempts/agents cascade the M4 migration rides on.
describe("compiled query-resource — rel() cascade edges end-to-end", () => {
  test("a rel() edge cascades a scoped upstream change into a downstream keyed delta", async () => {
    // `up` reads convs; `down` reads attempts_t and cascades off `up` via a
    // single-hop edge (conv id → its attemptId). A scoped convs change flows
    // through the edge and refills only the mapped attempt row.
    const h = harness({ up_a: ["convs"], down_a: ["attempts_t"] });
    const loads: boolean[] = [];
    const idsSeen: (readonly string[] | undefined)[] = [];
    let subscribed = false;
    const up = register(
      h.runtime,
      "up_a",
      {
        from: convs,
        identity: { pk: convs.id },
        db: fakeDb(() => [{ id: "c1", n: 1 }], () => [{ id: "c1", n: 2 }]),
      },
      [],
      () => subscribed,
    );
    register(
      h.runtime,
      "down_a",
      {
        from: attemptsT,
        identity: { pk: attemptsT.id },
        edges: [rel(up, { via: convs, from: convs.id, to: convs.attemptId })],
        db: fakeDb(
          () => [{ id: "at1", n: 1 }],
          () => [{ id: "at1", n: 2 }],
          () => [{ v: "at1" }], // affectedMap: conv c1 → attempt at1
        ),
      },
      loads,
      () => subscribed,
      idsSeen,
    );
    await h.subscribe("up_a");
    await h.subscribe("down_a");
    subscribed = true;

    h.runtime.applyDbChange({ table: "convs", op: "U", ids: ["c1"], origin: "convs", identityBase: "convs" });
    await tick();

    const downPushes = h.pushesFor("down_a");
    expect(downPushes).toHaveLength(1);
    expect(downPushes[0]!.kind).toBe("delta"); // scoped keyed upsert, no order
    expect(loads).toEqual([true]); // down loaded scoped via the cascade
    expect(idsSeen).toEqual([["at1"]]); // the edge mapped conv → attempt
  });

  test("a 3-level A→B→C cascade (conv→attempts→tasks shape) flows through both edges scoped", async () => {
    // A = conversations-active (keyed queryResource), B = attempts (keyed
    // defineResource with a HAND-WRITTEN loader + a DERIVED `compileEdges` edge),
    // C = tasks (keyed queryResource with an `edges` edge) — mirroring production.
    // A scoped conv change must propagate A→B→C with each hop's ids correctly
    // mapped (conv → attempt → task).
    const h = harness({ A: ["convs"], B: ["attempts_t"], C: ["tasks_t"] });
    let subscribed = false;
    const A = register(
      h.runtime,
      "A",
      {
        from: convs,
        identity: { pk: convs.id },
        db: fakeDb(() => [{ id: "c1", n: 1 }], () => [{ id: "c1", n: 2 }]),
      },
      [],
      () => subscribed,
    );
    // B: a bespoke loader (the attempts nested-join analogue) whose cascade edge
    // is nonetheless DERIVED via `compileEdges` (the migration's hand-written half).
    const bIds: (readonly string[] | undefined)[] = [];
    const B = h.runtime.defineResource(keyed("B"), {
      identityTable: "attempts_t",
      dependsOn: compileEdges(
        [rel(A, { via: convs, from: convs.id, to: convs.attemptId })],
        fakeDb(() => [], () => [], () => [{ v: "at1" }]), // conv c1 → attempt at1
      ),
      loader: (_p: ResourceParams, ctx?: { affectedIds: readonly string[] }) => {
        if (subscribed) bIds.push(ctx?.affectedIds);
        return ctx ? [{ id: "at1", n: 2 }] : [{ id: "at1", n: 1 }];
      },
    } as ServerResourceOptions<{ id: string; n: number }[]> & ScopePolicy);
    const cLoads: boolean[] = [];
    const cIds: (readonly string[] | undefined)[] = [];
    register(
      h.runtime,
      "C",
      {
        from: tasksT,
        identity: { pk: tasksT.id },
        edges: [rel(B, { via: attemptsT, from: attemptsT.id, to: attemptsT.taskId })],
        db: fakeDb(
          () => [{ id: "ta1", n: 1 }],
          () => [{ id: "ta1", n: 2 }],
          () => [{ v: "ta1" }], // affectedMap: attempt at1 → task ta1
        ),
      },
      cLoads,
      () => subscribed,
      cIds,
    );
    await h.subscribe("A");
    await h.subscribe("B");
    await h.subscribe("C");
    subscribed = true;

    h.runtime.applyDbChange({ table: "convs", op: "U", ids: ["c1"], origin: "convs", identityBase: "convs" });
    await tick();

    expect(h.pushesFor("B")).toHaveLength(1);
    expect(h.pushesFor("B")[0]!.kind).toBe("delta");
    expect(h.pushesFor("C")).toHaveLength(1);
    expect(h.pushesFor("C")[0]!.kind).toBe("delta");
    expect(bIds).toEqual([["at1"]]); // edge A→B mapped conv → attempt
    expect(cIds).toEqual([["ta1"]]); // edge B→C mapped attempt → task
    expect(cLoads).toEqual([true]); // C loaded scoped, not FULL
  });

  test("the signature gate drops a transient-only upstream change (affectedMap not consulted)", async () => {
    // The edge carries a `signature` returning a CONSTANT signature per id. The
    // first change is new → passes the gate → affectedMap runs → a downstream
    // frame. The second change has the SAME signature → the relevance gate
    // short-circuits the edge BEFORE affectedMap, so no second frame and the
    // affectedMap (distinct) is never re-consulted.
    let distinctCalls = 0;
    const h = harness({ up_s: ["convs"], down_s: ["attempts_t"] });
    const loads: boolean[] = [];
    let subscribed = false;
    const up = register(
      h.runtime,
      "up_s",
      {
        from: convs,
        identity: { pk: convs.id },
        // Distinct n each call so `up` itself always ships a frame — isolating the
        // gate's effect to the DOWNSTREAM edge.
        db: fakeDb(() => [{ id: "c1", n: 1 }], (() => {
          let k = 1;
          return () => [{ id: "c1", n: ++k }];
        })()),
      },
      [],
      () => subscribed,
    );
    register(
      h.runtime,
      "down_s",
      {
        from: attemptsT,
        identity: { pk: attemptsT.id },
        edges: [
          rel(
            up,
            { via: convs, from: convs.id, to: convs.attemptId },
            {
              // Only transient fields changed ⇒ the same signature both times.
              signature: (ids) => new Map([...ids].map((id) => [id, "sig-const"])),
            },
          ),
        ],
        db: fakeDb(
          () => [{ id: "at1", n: 1 }],
          () => [{ id: "at1", n: 2 }],
          () => {
            distinctCalls++;
            return [{ v: "at1" }];
          },
        ),
      },
      loads,
      () => subscribed,
    );
    await h.subscribe("up_s");
    await h.subscribe("down_s");
    subscribed = true;

    // First change: new signature → passes → one downstream delta, affectedMap once.
    h.runtime.applyDbChange({ table: "convs", op: "U", ids: ["c1"], origin: "convs", identityBase: "convs" });
    await tick();
    expect(h.pushesFor("down_s")).toHaveLength(1);
    expect(loads).toEqual([true]);
    expect(distinctCalls).toBe(1);

    // Second change: identical signature → the gate short-circuits the edge, so
    // no new downstream frame and affectedMap is never re-consulted.
    h.runtime.applyDbChange({ table: "convs", op: "U", ids: ["c1"], origin: "convs", identityBase: "convs" });
    await tick();
    expect(h.pushesFor("down_s")).toHaveLength(1); // still just the first frame
    expect(loads).toEqual([true]); // down never re-loaded
    expect(distinctCalls).toBe(1); // affectedMap not consulted the second time
  });
});

// M5 scopedMembership, end-to-end through the compiled query-resource → runtime
// membership path. Each test registers a `scopedMembership: true` resource, seeds
// the snapshot at sub-ack, then drives one op through `applyDbChange`, asserting
// the shipped delta AND the exact number of loader / orderOf queries. The fake db
// flips to "scoped" on the first `.where()` (the scoped refill's `pk IN (…)`);
// `orderOf` never calls `.where()` here, so it resolves to the FULL script — the
// post-change ordered set. See research/2026-07-03-global-scoped-membership-m5.md.
describe("compiled query-resource — scopedMembership (M5) end-to-end", () => {
  // Register a scopedMembership resource, wrapping the loader (scoped-vs-full) AND
  // the derived `orderOf` so the test can count each independently.
  function registerSm(
    runtime: ReturnType<typeof createResourceRuntime>,
    key: string,
    db: QueryDb,
    loads: boolean[],
    orderOfCalls: { n: number },
    subscribed: () => boolean,
  ) {
    const { serverOpts } = compileQuery({ from: rows, identity: { pk: rows.id }, scopedMembership: true, db });
    const innerLoader = serverOpts.loader;
    const innerOrderOf = serverOpts.scopedMembership!.orderOf;
    const wrapped = {
      ...serverOpts,
      loader: (p: ResourceParams, ctx?: { affectedIds: readonly string[] }) => {
        if (subscribed()) loads.push(ctx !== undefined);
        return innerLoader(p, ctx);
      },
      scopedMembership: {
        orderOf: (p: ResourceParams) => {
          if (subscribed()) orderOfCalls.n++;
          return innerOrderOf(p);
        },
      },
    } as ServerResourceOptions<{ id: string; n: number }[]> & ScopePolicy;
    return runtime.defineResource(keyed(key), wrapped);
  }

  test("op I: refill + orderOf (one each) → delta with upsert + order", async () => {
    // Before the insert the set is {a}; the insert adds `b`. The scoped refill
    // returns only `b`; `b` is not in the snapshot ⇒ orderOf runs once to place it.
    let inserted = false;
    const h = harness({ rows: ["rows"] });
    const loads: boolean[] = [];
    const orderOfCalls = { n: 0 };
    let subscribed = false;
    registerSm(
      h.runtime,
      "rows",
      fakeDb(
        () => (inserted ? [{ id: "a", n: 1 }, { id: "b", n: 1 }] : [{ id: "a", n: 1 }]),
        () => [{ id: "b", n: 1 }],
      ),
      loads,
      orderOfCalls,
      () => subscribed,
    );
    await h.subscribe("rows"); // sub-ack seeds the snapshot = {a}
    subscribed = true;
    inserted = true;

    h.runtime.applyDbChange({ table: "rows", op: "I", ids: ["b"], origin: "rows", identityBase: "rows" });
    await tick();

    const pushes = h.pushesFor("rows");
    expect(pushes).toHaveLength(1);
    expect(pushes[0]!.kind).toBe("delta");
    expect(pushes[0]!.upserts).toEqual([["b", { id: "b", n: 1 }]]);
    expect(pushes[0]!.order).toEqual(["a", "b"]); // membership asserted via orderOf
    expect(loads).toEqual([true]); // exactly one scoped refill
    expect(orderOfCalls.n).toBe(1); // exactly one orderOf (a row entered)
  });

  test("op D: ZERO queries → delta with deletes + order (from the snapshot)", async () => {
    const h = harness({ rows: ["rows"] });
    const loads: boolean[] = [];
    const orderOfCalls = { n: 0 };
    let subscribed = false;
    registerSm(
      h.runtime,
      "rows",
      fakeDb(
        () => [{ id: "a", n: 1 }, { id: "b", n: 1 }],
        () => [],
      ),
      loads,
      orderOfCalls,
      () => subscribed,
    );
    await h.subscribe("rows"); // snapshot = {a, b}
    subscribed = true;

    h.runtime.applyDbChange({ table: "rows", op: "D", ids: ["a"], origin: "rows", identityBase: "rows" });
    await tick();

    const pushes = h.pushesFor("rows");
    expect(pushes).toHaveLength(1);
    expect(pushes[0]!.kind).toBe("delta");
    expect(pushes[0]!.deletes).toEqual(["a"]);
    expect(pushes[0]!.order).toEqual(["b"]); // prior order minus the deleted id
    expect(loads).toEqual([]); // a pure DELETE runs NO loader
    expect(orderOfCalls.n).toBe(0); // and NO orderOf — order derived from the snapshot
  });

  test("op U where-flip: one refill (empty), no orderOf → delta with a membership exit", async () => {
    // The UPDATE flips `a` out of the filter: the scoped refill returns nothing for
    // it, so it is a membership EXIT — shipped as a real delete + order (the
    // correctness win over a plain scoped refill, which would leave it stale).
    const h = harness({ rows: ["rows"] });
    const loads: boolean[] = [];
    const orderOfCalls = { n: 0 };
    let subscribed = false;
    registerSm(
      h.runtime,
      "rows",
      fakeDb(
        () => [{ id: "a", n: 1 }, { id: "b", n: 1 }],
        () => [], // the refilled id `a` no longer matches ⇒ empty ⇒ exit
      ),
      loads,
      orderOfCalls,
      () => subscribed,
    );
    await h.subscribe("rows"); // snapshot = {a, b}
    subscribed = true;

    h.runtime.applyDbChange({ table: "rows", op: "U", ids: ["a"], origin: "rows", identityBase: "rows" });
    await tick();

    const pushes = h.pushesFor("rows");
    expect(pushes).toHaveLength(1);
    expect(pushes[0]!.kind).toBe("delta");
    expect(pushes[0]!.deletes).toEqual(["a"]);
    expect(pushes[0]!.order).toEqual(["b"]);
    expect(loads).toEqual([true]); // one scoped refill for the requested id
    expect(orderOfCalls.n).toBe(0); // no entry ⇒ no orderOf
  });
});
