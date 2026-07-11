/**
 * Real-DB suite for the pages trash chokepoint: `deleteBlocksSubtree`,
 * `untrashBlocks`, `purgeTrashedPages`. Headless — drives the db-parametrized
 * functions against a throwaway Postgres (db-test-fixture) with the REAL migration
 * chain, so the `page_blocks` self-FK cascades + the partial unique indexes are
 * exactly what production applies. Fake lifecycle hooks (registered via
 * `collectContributions`) stand in for the search / history / links consumers.
 *
 * Run: `bun test plugins/page/plugins/editor/server/internal/trash-blocks.test.ts`
 * (requires the running embedded cluster — `./singularity build` first).
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import {
  createTestDb,
  type TestDb,
} from "@plugins/database/plugins/db-test-fixture/server";
import { runMigrations } from "@plugins/database/plugins/migrations/server";
import { collectContributions } from "@plugins/framework/plugins/server-core/core";
import { TrashEntrySchema } from "@plugins/infra/plugins/trash/core";
import { _trashEntries } from "@plugins/infra/plugins/trash/server";
import { _blocks } from "./tables";
import { parseBlockData } from "./parse-block-data";
import { BlockLifecycle } from "./document-hooks";
import {
  deleteBlocksSubtree,
  untrashBlocks,
  purgeTrashedPages,
} from "./trash-blocks";

let t: TestDb;

const trashCalls: string[][] = [];
const restoreCalls: string[][] = [];
const beforeDeleteCalls: string[][] = [];

beforeAll(async () => {
  t = await createTestDb({ prefix: "trash_blocks_test" });
  await runMigrations(t.db);

  // Fake consumer hooks. BeforeDelete mimics the history hook: it drops
  // `entity_versions` for any page ids in the (purge/hard-delete) set — the only
  // place versions are destroyed. Trash NEVER runs BeforeDelete, so this fake is
  // exactly what proves "versions survive trash, die at purge".
  collectContributions([
    {
      id: "trash-blocks-test",
      contributions: [
        BlockLifecycle.OnTrash({
          onTrash: (ids) => {
            trashCalls.push(ids);
          },
        }),
        BlockLifecycle.OnRestore({
          onRestore: (ids) => {
            restoreCalls.push(ids);
          },
        }),
        BlockLifecycle.BeforeDelete({
          beforeDelete: async (ids) => {
            beforeDeleteCalls.push(ids);
            if (ids.length > 0) {
              await t.db.execute(
                sql`DELETE FROM entity_versions WHERE source_id = 'pages' AND entity_id IN (${sql.join(
                  ids.map((id) => sql`${id}`),
                  sql`, `,
                )})`,
              );
            }
          },
        }),
      ],
    },
  ]);
});

afterAll(async () => {
  await t.drop();
});

beforeEach(async () => {
  trashCalls.length = 0;
  restoreCalls.length = 0;
  beforeDeleteCalls.length = 0;
  // A clean slate per test (order-independent).
  await t.db.execute(sql`DELETE FROM page_blocks`);
  await t.db.execute(sql`DELETE FROM entity_versions`);
  await t.db.execute(sql`DELETE FROM trash_entries`);
});

// ── Seed helpers ───────────────────────────────────────────────────────────

async function seedBlock(args: {
  id: string;
  parentId: string | null;
  pageId: string | null;
  type: string;
  rank: string;
  title?: string;
}): Promise<void> {
  await t.db.insert(_blocks).values({
    id: args.id,
    parentId: args.parentId,
    pageId: args.pageId,
    type: args.type,
    rank: args.rank,
    data: parseBlockData(
      args.type,
      args.type === "page" ? { title: args.title ?? args.id, icon: null } : undefined,
    ),
  });
}

async function seedDoc(blockId: string): Promise<void> {
  await t.db.execute(
    sql`INSERT INTO page_block_docs (block_id, state) VALUES (${blockId}, decode('00', 'hex'))`,
  );
}

async function seedVersion(entityId: string): Promise<void> {
  await t.db.execute(
    sql`INSERT INTO entity_versions (id, source_id, entity_id, snapshot)
        VALUES (${`v-${entityId}-${Math.random()}`}, 'pages', ${entityId}, '{}'::jsonb)`,
  );
}

async function row(id: string) {
  const [r] = await t.db.select().from(_blocks).where(eq(_blocks.id, id));
  return r;
}

async function countDocs(blockId: string): Promise<number> {
  const res = await t.db.execute<{ n: number }>(
    sql`SELECT count(*)::int AS n FROM page_block_docs WHERE block_id = ${blockId}`,
  );
  return res.rows[0]!.n;
}

async function countVersions(entityId: string): Promise<number> {
  const res = await t.db.execute<{ n: number }>(
    sql`SELECT count(*)::int AS n FROM entity_versions WHERE entity_id = ${entityId}`,
  );
  return res.rows[0]!.n;
}

/**
 * The incident shape: a workspace page W containing two sub-pages A and B, A
 * itself containing a sub-sub-page A2. Each page has a content text block with a
 * CRDT doc and a version row.
 */
async function seedIncident(): Promise<void> {
  await seedBlock({ id: "W", parentId: null, pageId: null, type: "page", rank: "a0" });
  // A: sub-page in W's content, with content A1 + a sub-sub-page A2.
  await seedBlock({ id: "A", parentId: "W", pageId: "W", type: "page", rank: "a0" });
  await seedBlock({ id: "A1", parentId: "A", pageId: "A", type: "text", rank: "a0" });
  await seedBlock({ id: "A2", parentId: "A", pageId: "A", type: "page", rank: "a1" });
  await seedBlock({ id: "A2a", parentId: "A2", pageId: "A2", type: "text", rank: "a0" });
  // B: sub-page in W's content, with content B1.
  await seedBlock({ id: "B", parentId: "W", pageId: "W", type: "page", rank: "a1" });
  await seedBlock({ id: "B1", parentId: "B", pageId: "B", type: "text", rank: "a0" });
  for (const id of ["A1", "A2a", "B1"]) await seedDoc(id);
  for (const id of ["A", "A2", "B"]) await seedVersion(id);
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("deleteBlocksSubtree — trash path (incident shape)", () => {
  test("bulk-deleting two sub-pages trashes both subtrees, one entry each; docs + versions survive", async () => {
    await seedIncident();

    const result = await deleteBlocksSubtree(["A", "B"], t.db);
    expect(result).toEqual({ trashed: true });

    // Two independently-restorable entries, one per page ROOT.
    const entries = await t.db.select().from(_trashEntries);
    expect(entries).toHaveLength(2);
    expect(new Set(entries.map((e) => e.rootEntityId))).toEqual(new Set(["A", "B"]));
    expect(entries.every((e) => e.sourceId === "pages")).toBe(true);
    const entryA = entries.find((e) => e.rootEntityId === "A")!;
    const entryB = entries.find((e) => e.rootEntityId === "B")!;

    // Every descendant row — INCLUDING cross-`page_id` content — is flagged, under
    // the correct entry.
    for (const id of ["A", "A1", "A2", "A2a"]) {
      const r = await row(id);
      expect(r?.deletedAt).toBeInstanceOf(Date);
      expect(r?.trashEntryId).toBe(entryA.id);
    }
    for (const id of ["B", "B1"]) {
      const r = await row(id);
      expect(r?.deletedAt).toBeInstanceOf(Date);
      expect(r?.trashEntryId).toBe(entryB.id);
    }
    // The container W is untouched.
    expect((await row("W"))?.deletedAt).toBeNull();

    // The CRDT docs and version history SURVIVE (no cascade fired).
    expect(await countDocs("A1")).toBe(1);
    expect(await countDocs("A2a")).toBe(1);
    expect(await countDocs("B1")).toBe(1);
    expect(await countVersions("A")).toBe(1);
    expect(await countVersions("A2")).toBe(1);
    expect(await countVersions("B")).toBe(1);

    // OnTrash fired with the full set; BeforeDelete (the version killer) did NOT.
    expect(beforeDeleteCalls).toHaveLength(0);
    expect(trashCalls.flat().sort()).toEqual(["A", "A1", "A2", "A2a", "B", "B1"]);
  });

  test("a page-free delete set stays a HARD delete (rows gone, no entry)", async () => {
    await seedBlock({ id: "P", parentId: null, pageId: null, type: "page", rank: "a0" });
    await seedBlock({ id: "c1", parentId: "P", pageId: "P", type: "text", rank: "a0" });
    await seedBlock({ id: "c1a", parentId: "c1", pageId: "P", type: "text", rank: "a0" });

    const result = await deleteBlocksSubtree(["c1"], t.db);
    expect(result).toEqual({ trashed: false });

    expect(await row("c1")).toBeUndefined();
    expect(await row("c1a")).toBeUndefined(); // cascade
    expect(await t.db.select().from(_trashEntries)).toHaveLength(0);
    expect(beforeDeleteCalls.flat().sort()).toEqual(["c1", "c1a"]);
  });
});

describe("untrashBlocks", () => {
  test("restores exactly the entry's rows, leaving a separately-trashed page alone", async () => {
    await seedIncident();
    await deleteBlocksSubtree(["A", "B"], t.db);
    const entryA = TrashEntrySchema.parse(
      (await t.db.select().from(_trashEntries).where(eq(_trashEntries.rootEntityId, "A")))[0],
    );

    await untrashBlocks(entryA, t.db);

    for (const id of ["A", "A1", "A2", "A2a"]) {
      const r = await row(id);
      expect(r?.deletedAt).toBeNull();
      expect(r?.trashEntryId).toBeNull();
    }
    // B's entry is untouched.
    expect((await row("B"))?.deletedAt).toBeInstanceOf(Date);
    expect(restoreCalls.flat().sort()).toEqual(["A", "A1", "A2", "A2a"]);
  });

  test("rank collision on a restored root mints a fresh rank", async () => {
    await seedBlock({ id: "W", parentId: null, pageId: null, type: "page", rank: "a0" });
    await seedBlock({ id: "A", parentId: "W", pageId: "W", type: "page", rank: "a1" });

    await deleteBlocksSubtree(["A"], t.db);
    const entryA = TrashEntrySchema.parse(
      (await t.db.select().from(_trashEntries))[0],
    );

    // While A is trashed, a live sibling claims A's old slot (partial index
    // allows it — A is excluded).
    await seedBlock({ id: "A2", parentId: "W", pageId: "W", type: "page", rank: "a1" });

    await untrashBlocks(entryA, t.db);

    const restored = await row("A");
    expect(restored?.deletedAt).toBeNull();
    expect(restored?.rank).not.toBe("a1"); // re-ranked off the collision
    // Both siblings are live under W with distinct ranks (no unique violation).
    const live = await t.db
      .select()
      .from(_blocks)
      .where(and(eq(_blocks.parentId, "W"), isNull(_blocks.deletedAt)));
    expect(live).toHaveLength(2);
    expect(new Set(live.map((r) => r.rank)).size).toBe(2);
  });

  test("a restored root whose parent has vanished is reparented to the workspace root", async () => {
    // W → A → B (B nested under sub-page A). Trash B, then trash A. Restoring B
    // finds its parent A still trashed → reparent to root.
    await seedBlock({ id: "W", parentId: null, pageId: null, type: "page", rank: "a0" });
    await seedBlock({ id: "A", parentId: "W", pageId: "W", type: "page", rank: "a0" });
    await seedBlock({ id: "B", parentId: "A", pageId: "A", type: "page", rank: "a0" });
    await seedBlock({ id: "B1", parentId: "B", pageId: "B", type: "text", rank: "a0" });

    await deleteBlocksSubtree(["B"], t.db); // entryB flags {B, B1}
    await deleteBlocksSubtree(["A"], t.db); // entryA flags {A} only (B already trashed)

    const entryB = TrashEntrySchema.parse(
      (await t.db.select().from(_trashEntries).where(eq(_trashEntries.rootEntityId, "B")))[0],
    );
    await untrashBlocks(entryB, t.db);

    const b = await row("B");
    expect(b?.deletedAt).toBeNull();
    expect(b?.parentId).toBeNull(); // reparented to workspace root
    expect(b?.pageId).toBeNull(); // now a root page
    // Its own content survived and is still scoped to B.
    expect((await row("B1"))?.deletedAt).toBeNull();
    expect((await row("B1"))?.pageId).toBe("B");
  });
});

describe("purgeTrashedPages", () => {
  test("hard-deletes the roots + cascade, runs BeforeDelete (versions die only here)", async () => {
    await seedIncident();
    await deleteBlocksSubtree(["A", "B"], t.db);

    // Versions still there after trash.
    expect(await countVersions("A")).toBe(1);
    expect(await countVersions("A2")).toBe(1);

    const entryA = TrashEntrySchema.parse(
      (await t.db.select().from(_trashEntries).where(eq(_trashEntries.rootEntityId, "A")))[0],
    );
    await purgeTrashedPages([entryA], t.db);

    // A's whole subtree is hard-gone (cascade), including cross-page content + docs.
    for (const id of ["A", "A1", "A2", "A2a"]) {
      expect(await row(id)).toBeUndefined();
    }
    expect(await countDocs("A1")).toBe(0);
    expect(await countDocs("A2a")).toBe(0);
    // BeforeDelete fired over the full cascade set → versions destroyed at purge.
    expect(beforeDeleteCalls.flat().sort()).toEqual(["A", "A1", "A2", "A2a"]);
    expect(await countVersions("A")).toBe(0);
    expect(await countVersions("A2")).toBe(0);

    // B (a different entry) is untouched by this purge.
    expect((await row("B"))?.deletedAt).toBeInstanceOf(Date);
    expect(await countVersions("B")).toBe(1);
  });

  test("purging an already-gone entry is a no-op (idempotent)", async () => {
    await seedIncident();
    await deleteBlocksSubtree(["A"], t.db);
    const entryA = TrashEntrySchema.parse(
      (await t.db.select().from(_trashEntries))[0],
    );
    await purgeTrashedPages([entryA], t.db);
    beforeDeleteCalls.length = 0;
    // Second purge: nothing flagged → skipped.
    await purgeTrashedPages([entryA], t.db);
    expect(beforeDeleteCalls).toHaveLength(0);
  });
});

describe("re-trash (redo symmetry)", () => {
  test("trash → restore → trash mints a fresh entry each time", async () => {
    await seedBlock({ id: "W", parentId: null, pageId: null, type: "page", rank: "a0" });
    await seedBlock({ id: "A", parentId: "W", pageId: "W", type: "page", rank: "a0" });

    await deleteBlocksSubtree(["A"], t.db);
    const first = TrashEntrySchema.parse((await t.db.select().from(_trashEntries))[0]);
    await untrashBlocks(first, t.db);
    // The consumer (the trash endpoint / patch handler) deletes the consumed entry.
    await t.db.delete(_trashEntries).where(eq(_trashEntries.id, first.id));

    await deleteBlocksSubtree(["A"], t.db);
    const entries = await t.db.select().from(_blocks).where(isNotNull(_blocks.deletedAt));
    expect(entries).toHaveLength(1);
    const second = await t.db.select().from(_trashEntries);
    expect(second).toHaveLength(1);
    expect(second[0]!.id).not.toBe(first.id);
  });
});
