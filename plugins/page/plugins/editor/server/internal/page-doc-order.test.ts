/**
 * Real-DB suite for the `pages` loader's derived document order (`docRank`).
 * Headless — drives the db-parametrized `loadPages` / `docOrderPaths` against a
 * throwaway Postgres (db-test-fixture) with the REAL migration chain, so the
 * `page_blocks` self-FK and the partial unique rank indexes are exactly what
 * production applies.
 *
 * Run: `bun test plugins/page/plugins/editor/server/internal/page-doc-order.test.ts`
 * (requires the running embedded cluster — `./singularity build` first).
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { AsyncLocalStorage } from "node:async_hooks";
import { z } from "zod";
import { sql } from "drizzle-orm";
import {
  getReadSetIndex,
  installSpanContextRuntime,
  recordEntrySpan,
  resetRuntimeProfile,
  type EntryContext,
} from "@plugins/infra/plugins/runtime-profiler/core";
import { pagesResource } from "../../core/resources";
import {
  createTestDb,
  type TestDb,
} from "@plugins/database/plugins/db-test-fixture/server";
import { runMigrations } from "@plugins/database/plugins/migrations/server";
import { collectContributions } from "@plugins/framework/plugins/server-core/core";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import { defineBlock } from "../../core";
import { pageBlockHandle } from "../../core/schemas";
import { _blocks } from "./tables";
import { Editor } from "./block-registry";
import { parseBlockData } from "./parse-block-data";
import { docOrderPaths } from "./page-doc-order";
import { loadPages } from "./resources";

// Stand-ins for the content block types the seeds nest sub-pages under. The
// concrete `page/text` + `page/toggle` plugins import THIS plugin, so importing
// them back would be a cycle; `seedBlock` only needs the type to resolve.
const textBlockStub = defineBlock({ type: "text", schema: z.object({}), empty: () => ({}) });
const toggleBlockStub = defineBlock({ type: "toggle", schema: z.object({}), empty: () => ({}) });

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb({ prefix: "page_doc_order_test" });
  await runMigrations(t.db);
  collectContributions([
    {
      id: "page-doc-order-test",
      contributions: [
        Editor.BlockData(pageBlockHandle),
        Editor.BlockData(textBlockStub),
        Editor.BlockData(toggleBlockStub),
      ],
    },
  ]);
});

afterAll(async () => {
  await t.drop();
});

beforeEach(async () => {
  await t.db.execute(sql`DELETE FROM page_blocks`);
});

async function seedBlock(args: {
  id: string;
  parentId: string | null;
  pageId: string | null;
  type: string;
  rank: string;
}): Promise<void> {
  await t.db.insert(_blocks).values({
    id: args.id,
    parentId: args.parentId,
    pageId: args.pageId,
    type: args.type,
    rank: args.rank,
    data: parseBlockData(
      args.type,
      args.type === "page" ? { title: args.id, icon: null } : undefined,
    ),
  });
}

/** Page ids in the loader's array order, restricted to one sidebar group. */
async function orderIn(pageId: string | null): Promise<string[]> {
  const rows = await loadPages(t.db);
  return rows.filter((r) => r.pageId === pageId).map((r) => r.id);
}

describe("document order across rank spaces", () => {
  /**
   * The incident shape, and the whole point of `docRank`: page W's sub-pages
   * live in TWO different `(parent_id, rank)` spaces — `direct` is a direct
   * child of W, while `nested` sits under a toggle block. Both legitimately hold
   * rank "a1" (different parents ⇒ no unique-index conflict), so the old global
   * `rank` sort was meaningless AND fed `Rank.between("a1","a1")` — which throws
   * and silently aborted the drop.
   *
   *   W
   *   ├── toggle       (rank a0)
   *   │   ├── nestedA  (page, rank a1)   ← document position 1
   *   │   └── nestedB  (page, rank a2)   ← document position 2
   *   └── direct       (page, rank a1)   ← document position 3
   */
  beforeEach(async () => {
    await seedBlock({ id: "W", parentId: null, pageId: null, type: "page", rank: "a0" });
    await seedBlock({ id: "toggle", parentId: "W", pageId: "W", type: "toggle", rank: "a0" });
    await seedBlock({ id: "nestedA", parentId: "toggle", pageId: "W", type: "page", rank: "a1" });
    await seedBlock({ id: "nestedB", parentId: "toggle", pageId: "W", type: "page", rank: "a2" });
    await seedBlock({ id: "direct", parentId: "W", pageId: "W", type: "page", rank: "a1" });
  });

  test("resource order == document order, not a global rank sort", async () => {
    expect(await orderIn("W")).toEqual(["nestedA", "nestedB", "direct"]);
  });

  test("docRank is strictly ascending in array order within a group", async () => {
    const rows = (await loadPages(t.db)).filter((r) => r.pageId === "W");
    for (let i = 1; i < rows.length; i++) {
      expect(Rank.compare(rows[i - 1]!.docRank, rows[i]!.docRank)).toBe(-1);
    }
  });

  test("docRank is unique within a group even where raw rank collides", async () => {
    const rows = (await loadPages(t.db)).filter((r) => r.pageId === "W");
    // The precondition this whole change exists for.
    expect(rows.filter((r) => r.rank.toString() === "a1")).toHaveLength(2);
    const docRanks = rows.map((r) => r.docRank.toString());
    expect(new Set(docRanks).size).toBe(docRanks.length);
  });

  test("docRank derives from ranks, not content — a data.text write yields an identical result", async () => {
    const before = await loadPages(t.db);
    await t.db.execute(
      sql`UPDATE page_blocks SET data = '{"text":"typing…"}'::jsonb WHERE id = 'toggle'`,
    );
    const after = await loadPages(t.db);
    expect(after.map((r) => [r.id, r.docRank.toString()])).toEqual(
      before.map((r) => [r.id, r.docRank.toString()]),
    );
  });

  test("a trashed page leaves the group and its docRanks re-mint contiguously", async () => {
    await t.db.execute(sql`UPDATE page_blocks SET deleted_at = now() WHERE id = 'nestedA'`);
    expect(await orderIn("W")).toEqual(["nestedB", "direct"]);
  });
});

describe("membership is never a function of the traversal", () => {
  // Hole B. A live page whose ancestor chain is broken (its `parentId` points at
  // a trashed row) must still APPEAR — otherwise it vanishes not just from the
  // sidebar but from the `[[` picker, breadcrumbs, the story gallery and the
  // blog panel. It is kept and deterministically placed last in its group.
  test("a page with a broken ancestor chain still appears, sorted last in its group", async () => {
    await seedBlock({ id: "W", parentId: null, pageId: null, type: "page", rank: "a0" });
    await seedBlock({ id: "ok", parentId: "W", pageId: "W", type: "page", rank: "a5" });
    await seedBlock({ id: "gone", parentId: "W", pageId: "W", type: "text", rank: "a0" });
    await seedBlock({ id: "broken", parentId: "gone", pageId: "W", type: "page", rank: "a0" });
    // The dangling pointer: `broken`'s parent is trashed, so the upward walk
    // cannot reach W. (Unreachable through the UI — this is the corruption shape
    // the destination-parent liveness guard closes.)
    await t.db.execute(sql`UPDATE page_blocks SET deleted_at = now() WHERE id = 'gone'`);

    const paths = await docOrderPaths(t.db);
    expect(paths.has("broken")).toBe(false); // no resolvable path…
    expect(await orderIn("W")).toEqual(["ok", "broken"]); // …but never dropped.
  });
});

describe("cycle guard", () => {
  // Hole C. A `parent_id` cycle would recurse forever and pin a pool connection
  // on a path that re-runs on every write. The depth cap terminates it; the
  // cycled page has no terminal row, so it falls to the unresolved branch.
  test("a parent_id cycle terminates and never drops the row", async () => {
    await seedBlock({ id: "W", parentId: null, pageId: null, type: "page", rank: "a0" });
    await seedBlock({ id: "x", parentId: "W", pageId: "W", type: "text", rank: "a0" });
    await seedBlock({ id: "y", parentId: "x", pageId: "W", type: "text", rank: "a0" });
    await seedBlock({ id: "cycled", parentId: "y", pageId: "W", type: "page", rank: "a0" });
    // Close the loop: x → y → x. Seeded via raw SQL because the insert order
    // above cannot express it (the FK needs `y` to exist first).
    await t.db.execute(sql`UPDATE page_blocks SET parent_id = 'cycled' WHERE id = 'x'`);

    const rows = await loadPages(t.db);
    expect(rows.map((r) => r.id).sort()).toEqual(["W", "cycled"]);
  });
});

/**
 * Hole A, and the one test that MUST exist: this failure mode is silent.
 *
 * The read-set extractor matches only DOUBLE-QUOTED identifiers
 * (`\b(from|join)\s+"([^"]+)"`, `plugins/database/server/internal/client.ts`).
 * Raw SQL writing `FROM page_blocks` unquoted captures NOTHING — the
 * `page_blocks → pages` edge never registers in `tableToResources()`,
 * `applyDbChange` early-outs, and the sidebar just stops updating. No error, no
 * log, every other test still green.
 *
 * Capture happens in the instrumented `pool.query` wrapper keyed on the ambient
 * `loader` entry, so this runs the real loader against the REAL worktree DB
 * (read-only — the loader is a pure select) rather than the fixture's own
 * uninstrumented pool.
 */
describe("read-set (Hole A)", () => {
  // Inject the recorder's ambient runtime exactly the way
  // runtime-profiler/server/internal/install.ts does at boot.
  beforeEach(() => {
    const als = new AsyncLocalStorage<EntryContext>();
    installSpanContextRuntime({
      run: (ctx, fn) => als.run(ctx, fn),
      current: () => als.getStore(),
    });
    resetRuntimeProfile();
  });

  test("the pages loader's read-set contains page_blocks", async () => {
    await recordEntrySpan("loader", pagesResource.key, () => loadPages());
    expect(getReadSetIndex()[pagesResource.key]).toContain("page_blocks");
  });

  // The test above is the CONTRACT, but it cannot discriminate: the drizzle
  // membership select captures the edge on its own (the belt to the CTE's
  // braces), so it stays green even if the raw CTE goes unquoted. This one pins
  // the CTE in isolation — it is what actually fails if `${_blocks}` is ever
  // "simplified" to a bare `page_blocks`.
  test("docOrderPaths' raw CTE names the table quotably on its own", async () => {
    await recordEntrySpan("loader", "doc-order-paths-probe", () => docOrderPaths());
    expect(getReadSetIndex()["doc-order-paths-probe"]).toContain("page_blocks");
  });
});
