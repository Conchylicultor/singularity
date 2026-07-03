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
import { compileQuery } from "./compile";
import type { QueryDb, SelectMap } from "./spec";

const rows = pgTable("rows", {
  id: text("id").primaryKey(),
  n: integer("n").notNull(),
});

// A fake db whose scripted rows depend on whether the query is scoped. The
// scoped refill is the only path that calls `.where()` (the compiler adds
// `pk IN (...)`), so the fake flips to "scoped" on the first `.where()`. Full
// loads return the whole set; scoped loads return only the "changed" rows. No
// SQL is rendered here — that is covered by compile.test.ts.
function fakeDb(full: () => unknown[], scopedRows: () => unknown[]): QueryDb {
  const step = (scoped: boolean) => ({
    where: () => step(true),
    orderBy: () => step(scoped),
    limit: () => step(scoped),
    then: (resolve: (v: unknown[]) => unknown) =>
      Promise.resolve(scoped ? scopedRows() : full()).then(resolve),
  });
  const from = { from: () => step(false) };
  return {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    select: (_fields?: SelectMap) => from,
    selectDistinct: () => from,
  } as unknown as QueryDb;
}

interface SentFrame {
  seq: number;
  key: string;
  kind: string;
  version?: number;
}

function harness(readSetMap: Record<string, string[]>) {
  const runtime = createResourceRuntime({ readSet: (key) => readSetMap[key] ?? [] });
  const frames: SentFrame[] = [];
  let seq = 0;
  const ws = {
    send(raw: string) {
      const msg = JSON.parse(raw) as { kind: string; key?: string; version?: number };
      if (msg.kind === "ping") return;
      frames.push({ seq: seq++, key: msg.key ?? "", kind: msg.kind, version: msg.version });
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
) {
  const { serverOpts } = compileQuery(spec);
  const inner = serverOpts.loader;
  const wrapped = {
    ...serverOpts,
    loader: (p: ResourceParams, ctx?: { affectedIds: readonly string[] }) => {
      if (subscribed()) loads.push(ctx !== undefined);
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
