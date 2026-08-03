/**
 * Real-DB suite for the structural-write chokepoint: `withPageForest` +
 * `forest-writer`. Headless — drives the db-parametrized writers against a
 * throwaway Postgres (db-test-fixture) with the REAL migration chain, so the
 * advisory locks, the `page_blocks` self-FK cascades and the partial unique
 * indexes are exactly what production applies.
 *
 * Both defects this exists to pin are TIMING-dependent in the wild (a human
 * pausing between two structural keystrokes hid them for months), so every test
 * here drives the interleaving explicitly rather than hoping for it. That needs
 * two INDEPENDENT connections — the fixture's own pool is `max: 1`, so two
 * concurrent transactions on it would serialize in the pool and prove nothing —
 * hence the two extra single-connection handles opened below.
 *
 * Run: `bun test plugins/page/plugins/editor/server/internal/page-forest.test.ts`
 * (requires the running embedded cluster — `./singularity build` first).
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import {
  createTestDb,
  type TestDb,
} from "@plugins/database/plugins/db-test-fixture/server";
import { runMigrations } from "@plugins/database/plugins/migrations/server";
import { collectContributions } from "@plugins/framework/plugins/server-core/core";
import { applyBlockOp, defineBlock, type BlockOp } from "../../core";
import { pageBlockHandle } from "../../core/schemas";
import { _blocks } from "./tables";
import { Editor } from "./block-registry";
import { parseBlockData } from "./parse-block-data";
import { BlockLifecycle, type DeletedBlockRow } from "./document-hooks";
import { withPageForest } from "./page-forest";
import { insertBlocks, updateBlockFields, writeForestTarget } from "./forest-writer";
import { rowToNode } from "./reconcile";

// Stand-in for the `page/text` block type the seeds use: the concrete text block
// lives in `page/text`, which imports this plugin, so importing it back would be
// a cycle. Its `data` carries a `label` so a whole-row restatement has a visible
// field to clobber.
const textBlockStub = defineBlock({
  type: "text",
  schema: z.object({ label: z.string().optional() }),
  empty: () => ({}),
});

let t: TestDb;
/** Two independent connections, so two writers can genuinely be in flight. */
let poolA: Pool;
let poolB: Pool;
let dbA: NodePgDatabase;
let dbB: NodePgDatabase;

/** Every delete set an `OnDelete` hook was handed, in dispatch order. */
const handedDeletes: DeletedBlockRow[][] = [];

beforeAll(async () => {
  t = await createTestDb({ prefix: "page_forest_test" });
  await runMigrations(t.db);
  poolA = new Pool({ connectionString: t.connectionString, max: 1 });
  poolB = new Pool({ connectionString: t.connectionString, max: 1 });
  dbA = drizzle(poolA);
  dbB = drizzle(poolB);

  collectContributions([
    {
      id: "page-forest-test",
      contributions: [
        Editor.BlockData(pageBlockHandle),
        Editor.BlockData(textBlockStub),
        BlockLifecycle.OnDelete({
          onDelete: (rows) => {
            handedDeletes.push([...rows]);
          },
        }),
      ],
    },
  ]);
});

afterAll(async () => {
  // Close the extra connections first — a database with open sessions cannot be
  // dropped.
  await poolA.end();
  await poolB.end();
  await t.drop();
});

beforeEach(async () => {
  handedDeletes.length = 0;
  await t.db.execute(sql`DELETE FROM page_blocks`);
});

// ── Helpers ────────────────────────────────────────────────────────────────

async function seedBlock(args: {
  id: string;
  parentId: string | null;
  pageId: string | null;
  type: string;
  rank: string;
  label?: string;
}): Promise<void> {
  await t.db.insert(_blocks).values({
    id: args.id,
    parentId: args.parentId,
    pageId: args.pageId,
    type: args.type,
    rank: args.rank,
    data: parseBlockData(
      args.type,
      args.type === "page" ? { title: args.id, icon: null } : { label: args.label ?? "" },
    ),
  });
}

async function row(id: string) {
  const [r] = await t.db.select().from(_blocks).where(eq(_blocks.id, id));
  return r;
}

async function liveIds(): Promise<string[]> {
  const rows = await t.db.select({ id: _blocks.id }).from(_blocks);
  return rows.map((r) => r.id).sort();
}

/** A promise plus its resolver — the explicit hand-off between two writers. */
function gate(): { wait: Promise<void>; open: () => void } {
  let open!: () => void;
  const wait = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { wait, open };
}

/**
 * Let a racer reach its next statement (or block on the page lock). There is no
 * signal to await here BY DESIGN: under the lock the racer's read cannot
 * complete until the holder commits, so waiting for it would deadlock the test.
 * A fixed window is the honest tool for "give the other writer its chance".
 */
const RACE_WINDOW_MS = 200;
const raceWindow = () =>
  new Promise((resolve) => setTimeout(resolve, RACE_WINDOW_MS));

// ── 1. Lost update ─────────────────────────────────────────────────────────

/** What one of the two racing writers can do to the shared row. */
interface RowWriter {
  read: () => Promise<typeof _blocks.$inferSelect>;
  write: (changes: { expanded: boolean; data: unknown }) => Promise<void>;
}

/**
 * The captured incident, reduced: two writers read the same row and each writes
 * back a whole row with only ITS OWN column changed — restating every other
 * column from its own snapshot. Writer A owns `expanded`; writer B owns `data`.
 * Whoever commits second reasserts the first's column from its own read.
 *
 * The interleaving is driven, not hoped for. B attempts its read while A holds
 * the page, and B always commits SECOND — so the whole question is what B read:
 * under the lock its read blocks until A commits and sees post-A state; without
 * one it sees pre-A state and its restatement erases A.
 */
async function interleave(
  open: (body: (w: RowWriter) => Promise<void>) => Promise<unknown>,
): Promise<void> {
  const aHasRead = gate();
  const aMayWrite = gate();
  const bMayWrite = gate();

  const a = open(async ({ read, write }) => {
    const snap = await read();
    aHasRead.open();
    await aMayWrite.wait;
    await write({ expanded: !snap.expanded, data: snap.data });
  });

  await aHasRead.wait;

  const b = open(async ({ read, write }) => {
    const snap = await read();
    await bMayWrite.wait;
    await write({ expanded: snap.expanded, data: { label: "B" } });
  });

  // Give B its chance to read while A is still open: without a lock it succeeds
  // on pre-A state; with one it is parked on the lock and reads nothing yet.
  await raceWindow();
  aMayWrite.open();
  await a;
  // Only now does B write, so B is unambiguously the second committer.
  bMayWrite.open();
  await b;
}

describe("withPageForest — lost update", () => {
  beforeEach(async () => {
    await seedBlock({ id: "P", parentId: null, pageId: null, type: "page", rank: "a0" });
    await seedBlock({
      id: "x",
      parentId: "P",
      pageId: "P",
      type: "text",
      rank: "a0",
      label: "seed",
    });
  });

  test("two concurrent locked writers on one page both keep their effect", async () => {
    let next = 0;
    await interleave((body) =>
      withPageForest(
        "P",
        (ctx) =>
          body({
            read: async () => (await ctx.forest()).find((r) => r.id === "x")!,
            write: (changes) =>
              updateBlockFields(ctx.tx, "x", {
                expanded: changes.expanded,
                data: parseBlockData("text", changes.data),
              }),
          }),
        // A and B must sit on different connections or the pool serializes them
        // and there is nothing to test.
        next++ === 0 ? dbA : dbB,
      ),
    );

    const x = await row("x");
    // A's effect: `expanded` flipped off the seeded default.
    expect(x?.expanded).toBe(false);
    // B's effect: its own `data`.
    expect(x?.data).toEqual(parseBlockData("text", { label: "B" }));
  });

  test("the SAME interleaving under a bare db.transaction loses one of them", async () => {
    // The control. Without it this suite would prove only that Postgres works;
    // with it, the assertion above is provably about the LOCK.
    let next = 0;
    await interleave((body) => {
      const handle = next++ === 0 ? dbA : dbB;
      return handle.transaction((tx) =>
        body({
          read: async () =>
            (await tx.select().from(_blocks).where(eq(_blocks.id, "x")))[0]!,
          write: async (changes) => {
            await tx
              .update(_blocks)
              .set({
                expanded: changes.expanded,
                data: parseBlockData("text", changes.data),
              })
              .where(eq(_blocks.id, "x"));
          },
        }),
      );
    });

    const x = await row("x");
    // B committed last over a PRE-A snapshot, so it restored `expanded` and A's
    // edit is gone — while B's own edit survives. Exactly one effect is lost.
    expect(x?.expanded).toBe(true);
    expect(x?.data).toEqual(parseBlockData("text", { label: "B" }));
  });
});

// ── 2. Delete-set agreement ────────────────────────────────────────────────

describe("OnDelete — the hook sees what is actually deleted", () => {
  test("the handed set equals the set the transaction removed, with a writer racing it", async () => {
    await seedBlock({ id: "P", parentId: null, pageId: null, type: "page", rank: "a0" });
    await seedBlock({ id: "c1", parentId: "P", pageId: "P", type: "text", rank: "a0" });
    await seedBlock({ id: "c1a", parentId: "c1", pageId: "P", type: "text", rank: "a0" });

    const inserterHasLock = gate();
    const inserterMayCommit = gate();

    // The racer: it takes the page lock first and appends ANOTHER child under
    // `c1` — a row the deleter's cascade will destroy, and which a pre-lock read
    // could not have seen.
    const inserter = withPageForest(
      "P",
      async (ctx) => {
        await insertBlocks(ctx.tx, [
          {
            id: "c1b",
            pageId: "P",
            parentId: "c1",
            type: "text",
            data: parseBlockData("text", {}),
            rank: "a1",
          },
        ]);
        inserterHasLock.open();
        await inserterMayCommit.wait;
      },
      dbA,
    );

    await inserterHasLock.wait;

    // The deleter queues behind the lock, then removes `c1`'s whole subtree.
    const deleter = withPageForest(
      "P",
      async (ctx) => {
        const before = (await ctx.forest()).map(rowToNode);
        const removed = new Set(["c1", "c1a", "c1b"]);
        const after = before.filter((n) => !removed.has(n.id));
        return writeForestTarget(ctx, before, after);
      },
      dbB,
    );

    await raceWindow();
    inserterMayCommit.open();
    await inserter;
    const { value: write } = await deleter;

    expect(handedDeletes).toHaveLength(1);
    const handed = handedDeletes[0]!.map((r) => r.id).sort();

    // The authoritative agreement: what the hook was told, what the writer
    // reported, and what the database no longer holds are ONE set.
    expect(handed).toEqual(["c1", "c1a", "c1b"]);
    expect(write.deletedRows.map((r) => r.id).sort()).toEqual(handed);
    expect(await liveIds()).toEqual(["P"]);
    // Only the roots are deleted; the FK cascade reclaims the rest.
    expect(write.deleteRootIds).toEqual(["c1"]);
  });
});

// ── 3. Deadlock-freedom ────────────────────────────────────────────────────

describe("withPageForest — multi-page locking", () => {
  test("two writers naming the same pages in OPPOSITE order both complete", async () => {
    await seedBlock({ id: "P1", parentId: null, pageId: null, type: "page", rank: "a0" });
    await seedBlock({ id: "P2", parentId: null, pageId: null, type: "page", rank: "a1" });
    await seedBlock({ id: "x1", parentId: "P1", pageId: "P1", type: "text", rank: "a0" });
    await seedBlock({ id: "x2", parentId: "P2", pageId: "P2", type: "text", rank: "a0" });

    // Each writer touches BOTH pages while holding both locks. An acquisition
    // order taken from the argument list rather than a sort would put these two
    // in a cycle, and Postgres would abort one after `deadlock_timeout`.
    const touchBoth = (
      scopes: [string, string],
      handle: NodePgDatabase,
      label: string,
    ) =>
      withPageForest(
        scopes,
        async (ctx) => {
          await updateBlockFields(ctx.tx, "x1", {
            data: parseBlockData("text", { label }),
          });
          await raceWindow();
          await updateBlockFields(ctx.tx, "x2", {
            data: parseBlockData("text", { label }),
          });
        },
        handle,
      );

    await Promise.all([
      touchBoth(["P1", "P2"], dbA, "first"),
      touchBoth(["P2", "P1"], dbB, "second"),
    ]);

    // Both committed, and — because they were serialized rather than interleaved
    // — the two rows agree on whichever writer went second.
    const x1 = await row("x1");
    const x2 = await row("x2");
    expect(x1?.data).toEqual(x2?.data);
  });
});

// ── 4. The Stage-4a op kinds, through the one write shape ──────────────────

/**
 * `move` / `bulkMove` / `delete` stopped being bespoke endpoints and became
 * `BlockOp`s, so they now commit through `writeForestTarget` like every other
 * op. Two things that used to be each handler's own business are now the write
 * shape's, and both are checked against the REAL indexes here:
 *
 *  - **park-then-place is unconditional.** A `bulkMove` mints its window
 *    EXCLUDING the movers, so a final key routinely equals a rank a
 *    still-unmoved sibling holds. The `(parent_id, rank)` unique index is
 *    per-tuple and not deferrable, so without parking the transaction ABORTS.
 *    That is not a subtle wrong answer — it is a 500 on every such drag.
 *  - **the delete set is authoritative**, reconciled under the lock, and the
 *    `OnDelete` hooks see exactly it.
 */
describe("writeForestTarget — the drag/selection ops", () => {
  /** Apply an op the way `handleApplyBlockOp` does, and return the write. */
  async function commitOp(pageId: string, op: BlockOp) {
    const { value } = await withPageForest(
      pageId,
      async (ctx) => {
        const before = (await ctx.forest()).map(rowToNode);
        const after = applyBlockOp(before, op);
        return writeForestTarget(ctx, before, after);
      },
      t.db,
    );
    return value;
  }

  /** The live child ids under `parentId`, in rank order. */
  async function childIds(parentId: string): Promise<string[]> {
    const rows = await t.db
      .select({ id: _blocks.id, rank: _blocks.rank })
      .from(_blocks)
      .where(eq(_blocks.parentId, parentId));
    return rows.sort((x, y) => (x.rank < y.rank ? -1 : 1)).map((r) => r.id);
  }

  /** P ▸ [A, B, C, D] — four siblings sharing one ordering space. */
  async function seedRun(): Promise<void> {
    await seedBlock({ id: "P", parentId: null, pageId: null, type: "page", rank: "a0" });
    const ranks = ["a0", "a1", "a2", "a3"];
    for (const [i, id] of ["A", "B", "C", "D"].entries()) {
      await seedBlock({ id, parentId: "P", pageId: "P", type: "text", rank: ranks[i]! });
    }
  }

  test("bulkMove: a same-parent reorder whose keys transiently collide still commits", async () => {
    await seedRun();
    // Moving {B, D} after C mints ["a3","a4"] from the window ("a2", null) — and
    // `B → "a3"` lands while D still holds "a3". Parking is what makes the final
    // writes collision-free in any order.
    await commitOp("P", { kind: "bulkMove", ids: ["B", "D"], parentId: "P", afterId: "C" });
    expect(await childIds("P")).toEqual(["A", "C", "B", "D"]);
  });

  test("move: positional intent resolves against the row set the server holds", async () => {
    await seedRun();
    await commitOp("P", { kind: "move", blockId: "D", parentId: "P", targetId: "A", zone: "after" });
    expect(await childIds("P")).toEqual(["A", "D", "B", "C"]);
    // …and back out to the list's start, the boundary form.
    await commitOp("P", { kind: "move", blockId: "C", parentId: "P", targetId: null, zone: "before" });
    expect(await childIds("P")).toEqual(["C", "A", "D", "B"]);
  });

  test("move: reparenting into a sibling opens it and re-ranks nothing else", async () => {
    await seedRun();
    await t.db.update(_blocks).set({ expanded: false }).where(eq(_blocks.id, "A"));
    await commitOp("P", { kind: "move", blockId: "D", parentId: "A", targetId: null, zone: "after" });
    expect(await childIds("A")).toEqual(["D"]);
    expect(await childIds("P")).toEqual(["A", "B", "C"]);
    expect((await row("A"))?.expanded).toBe(true);
  });

  test("delete: ONE op removes every named subtree, and the hook sees that exact set", async () => {
    await seedRun();
    await seedBlock({ id: "A1", parentId: "A", pageId: "P", type: "text", rank: "a0" });
    await seedBlock({ id: "A1a", parentId: "A1", pageId: "P", type: "text", rank: "a0" });

    const write = await commitOp("P", { kind: "delete", blockIds: ["A", "C"] });

    expect(await liveIds()).toEqual(["B", "D", "P"]);
    // Roots only — the self-FK cascade reclaims the descendants…
    expect(write.deleteRootIds.sort()).toEqual(["A", "C"]);
    // …but the hook is handed the whole AUTHORITATIVE set, reconciled under the
    // lock: a bulk delete used to run its hooks over a set predicted outside it.
    expect(handedDeletes).toHaveLength(1);
    expect(handedDeletes[0]!.map((r) => r.id).sort()).toEqual(["A", "A1", "A1a", "C"]);
    expect(write.deferredPageDelete).toBe(false);
  });

  test("delete: a set containing a PAGE row defers, so nothing is hard-deleted here", async () => {
    await seedRun();
    await seedBlock({ id: "SUB", parentId: "P", pageId: "P", type: "page", rank: "a4" });

    const write = await commitOp("P", { kind: "delete", blockIds: ["A", "SUB"] });

    // The 2026-07-10 data-loss branch: the caller routes these through the trash
    // chokepoint instead, and `OnDelete` deliberately did not fire.
    expect(write.deferredPageDelete).toBe(true);
    expect(handedDeletes).toHaveLength(0);
    expect(await liveIds()).toEqual(["A", "B", "C", "D", "P", "SUB"]);
    expect(write.deleteRootIds.sort()).toEqual(["A", "SUB"]);
  });
});
