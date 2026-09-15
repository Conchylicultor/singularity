/**
 * Real-DB suite for the two page-row writes that are not the header's own
 * `PATCH` — `setPageAuthorOf` (the author toggle) and `renamePage` (an agent's
 * rename) — driven against a throwaway Postgres (db-test-fixture) with the REAL
 * migration chain, as `handle-patch-blocks.test.ts` is.
 *
 * What it pins (research/2026-09-15-page-agent-page-follow-ups.md §1, §3):
 *  - a flip writes the author and nothing else, both ways, and announces once;
 *  - setting the author a page already has writes nothing and announces nothing;
 *  - a rename keeps every other key, the author included;
 *  - `requireAuthor` refuses (409) a page that is not that party's, and writes
 *    nothing;
 *  - neither op reaches a non-page row, or a trashed one.
 *
 * Run: `./singularity test plugins/page/plugins/editor`
 * (requires the running embedded cluster — `./singularity build` first).
 */

import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "bun:test";
import { eq, sql } from "drizzle-orm";
import {
  createTestDb,
  type TestDb,
} from "@plugins/database/plugins/db-test-fixture/server";
import { runMigrations } from "@plugins/database/plugins/migrations/server";
import { collectContributions } from "@plugins/framework/plugins/server-core/core";
import { HttpError } from "@plugins/infra/plugins/endpoints/core";
import { defineBlock, textBlockSchema } from "../../core";
import { pageBlockHandle } from "../../core/schemas";
import { _blocks } from "./tables";
import { Editor } from "./block-registry";
import { parseBlockData } from "./parse-block-data";
import { deleteBlocksSubtree } from "./trash-blocks";
import { setPageAuthorOf } from "./handle-set-page-author";
import { renamePage } from "./rename-page";

// Stand-in for `page/text` (the concrete block plugin imports this one, so
// importing it back would be a cycle).
const textBlockStub = defineBlock({
  type: "text",
  schema: textBlockSchema({}),
  empty: () => ({ text: [] }),
});

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb({ prefix: "page_row_write_test" });
  await runMigrations(t.db);
});

afterAll(async () => {
  await t.drop();
});

beforeEach(async () => {
  // Re-installed per test: the registry is process-global, and another suite
  // in the same run installs its own.
  collectContributions([
    {
      id: "page-row-write-test",
      contributions: [
        Editor.BlockData(pageBlockHandle),
        Editor.BlockData(textBlockStub),
      ],
    },
  ]);
  await t.db.execute(sql`DELETE FROM page_blocks`);
  await t.db.execute(sql`DELETE FROM trash_entries`);
  await t.db.execute(sql`DELETE FROM event_emissions`);
});

// ── Helpers ────────────────────────────────────────────────────────────────

/** A cover, so "every other key is carried" is checked on a nested value too. */
const COVER = { type: "gradient", preset: "sunset" } as const;

/**
 * P (a top-level human page) ▸ [SUB (a human's sub-page, with an icon and a
 * cover), c1 "hello"], and AGENT (an agent-authored sub-page of P).
 */
async function seed(): Promise<void> {
  await t.db.insert(_blocks).values([
    {
      id: "P",
      parentId: null,
      pageId: null,
      type: "page",
      rank: "a0",
      data: parseBlockData("page", { title: "P", icon: null }),
    },
    {
      id: "SUB",
      parentId: "P",
      pageId: "P",
      type: "page",
      rank: "a0",
      data: parseBlockData("page", {
        title: "Notes",
        icon: "rocket",
        cover: COVER,
      }),
    },
    {
      id: "AGENT",
      parentId: "P",
      pageId: "P",
      type: "page",
      rank: "a1",
      data: parseBlockData("page", {
        title: "Findings",
        icon: null,
        author: "agent",
      }),
    },
    {
      id: "c1",
      parentId: "P",
      pageId: "P",
      type: "text",
      rank: "a2",
      data: parseBlockData("text", { text: "hello" }),
    },
  ]);
}

async function row(id: string) {
  const [r] = await t.db.select().from(_blocks).where(eq(_blocks.id, id));
  if (!r) throw new Error(`no row ${id}`);
  return r;
}

/**
 * A row's stored `data`, widened to `unknown` so a test compares it against a
 * plain literal — the `BlockData` brand is for writers, and a reader needs none.
 */
async function storedData(id: string): Promise<unknown> {
  return (await row(id)).data;
}

/** The `page.blocksChanged` announcements since the last reset, by page id. */
async function announced(): Promise<string[]> {
  const res = await t.db.execute<{ page_id: string }>(
    sql`SELECT payload->>'pageId' AS page_id FROM event_emissions
        WHERE event_name = 'page.blocksChanged'`,
  );
  return res.rows.map((r) => r.page_id).sort();
}

/** Await a write that must be refused with `status`, returning its message. */
async function refusedWith(
  write: Promise<unknown>,
  status: number,
): Promise<string> {
  try {
    await write;
  } catch (err) {
    if (!(err instanceof HttpError)) throw err;
    expect(err.status).toBe(status);
    return err.message;
  }
  throw new Error(`expected an HTTP ${status}`);
}

// ── setPageAuthorOf ────────────────────────────────────────────────────────

describe("setPageAuthorOf — the author toggle", () => {
  test("human → agent writes the marker, carries every other key, and announces once", async () => {
    await seed();
    const before = await row("SUB");

    const block = await setPageAuthorOf("SUB", "agent", t.db);

    const expected = {
      title: "Notes",
      icon: "rocket",
      cover: COVER,
      author: "agent",
    };
    expect(await storedData("SUB")).toEqual(expected);
    expect(block.data).toEqual(expected);
    expect(block.id).toBe("SUB");
    // Nothing else about the row moved.
    const after = await row("SUB");
    expect(after.parentId).toBe(before.parentId);
    expect(after.rank).toBe(before.rank);
    expect(after.updatedAt.getTime()).toBeGreaterThanOrEqual(
      before.updatedAt.getTime(),
    );
    // One announcement: the page's own id, and the page it sits in.
    expect(await announced()).toEqual(["P", "SUB"]);
  });

  test("agent → human removes the key, and announces once", async () => {
    await seed();

    await setPageAuthorOf("AGENT", "human", t.db);

    const data = await storedData("AGENT");
    expect(data).toEqual({ title: "Findings", icon: null });
    expect(Object.keys(data as object)).not.toContain("author");
    expect(await announced()).toEqual(["AGENT", "P"]);
  });

  test("setting the author a page already has is a no-op: no write, no event", async () => {
    await seed();
    const agentBefore = await row("AGENT");
    const humanBefore = await row("SUB");

    const agent = await setPageAuthorOf("AGENT", "agent", t.db);
    const human = await setPageAuthorOf("SUB", "human", t.db);

    // Byte-for-byte the same rows, `updated_at` included.
    expect(await row("AGENT")).toEqual(agentBefore);
    expect(await row("SUB")).toEqual(humanBefore);
    expect(agent.data).toEqual(agentBefore.data);
    expect(human.data).toEqual(humanBefore.data);
    expect(await announced()).toEqual([]);
  });

  test("a flip there and back is two writes, and lands where it started", async () => {
    await seed();
    await setPageAuthorOf("SUB", "agent", t.db);
    await setPageAuthorOf("SUB", "human", t.db);
    expect(await storedData("SUB")).toEqual({
      title: "Notes",
      icon: "rocket",
      cover: COVER,
    });
  });

  test("a top-level page can be flipped too — its only announcement is its own id", async () => {
    await seed();
    await setPageAuthorOf("P", "agent", t.db);
    expect(await storedData("P")).toEqual({
      title: "P",
      icon: null,
      author: "agent",
    });
    // A root page sits in the workspace root, which has no content list.
    expect(await announced()).toEqual(["P"]);
  });

  test("a non-page row is a 400; an unknown or trashed one a 404 — and nothing is written", async () => {
    await seed();
    await refusedWith(setPageAuthorOf("c1", "agent", t.db), 400);
    await refusedWith(setPageAuthorOf("nope", "agent", t.db), 404);

    await deleteBlocksSubtree(["SUB"], t.db);
    await t.db.execute(sql`DELETE FROM event_emissions`);
    await refusedWith(setPageAuthorOf("SUB", "agent", t.db), 404);
    expect(await storedData("SUB")).toEqual({
      title: "Notes",
      icon: "rocket",
      cover: COVER,
    });
    expect(await announced()).toEqual([]);
  });
});

// ── renamePage ─────────────────────────────────────────────────────────────

describe("renamePage — an agent's rename", () => {
  test("renames, keeping every other key — the author included", async () => {
    await seed();

    const block = await renamePage("AGENT", "Final findings", {}, t.db);

    const expected = { title: "Final findings", icon: null, author: "agent" };
    expect(await storedData("AGENT")).toEqual(expected);
    expect(block.data).toEqual(expected);
    expect(await announced()).toEqual(["AGENT", "P"]);
  });

  test("a human's page keeps its icon and cover through a rename", async () => {
    await seed();
    await renamePage("SUB", "Renamed", {}, t.db);
    expect(await storedData("SUB")).toEqual({
      title: "Renamed",
      icon: "rocket",
      cover: COVER,
    });
  });

  test("requireAuthor: 'agent' renames an agent page", async () => {
    await seed();
    await renamePage(
      "AGENT",
      "Final findings",
      { requireAuthor: "agent" },
      t.db,
    );
    expect(await storedData("AGENT")).toEqual({
      title: "Final findings",
      icon: null,
      author: "agent",
    });
  });

  test("requireAuthor: 'agent' refuses a human's page with a 409, and writes nothing", async () => {
    await seed();
    const before = await row("SUB");

    const message = await refusedWith(
      renamePage("SUB", "Hijacked", { requireAuthor: "agent" }, t.db),
      409,
    );

    expect(message).toMatch(/human's page/);
    expect(await row("SUB")).toEqual(before);
    expect(await announced()).toEqual([]);
  });

  test("requireAuthor sees a flip that landed first — the race it exists for", async () => {
    await seed();
    // The tool decided "agent page, so this is a rename"; the human flips it
    // before the rename's write.
    await setPageAuthorOf("AGENT", "human", t.db);
    await refusedWith(
      renamePage("AGENT", "Too late", { requireAuthor: "agent" }, t.db),
      409,
    );
    expect(await storedData("AGENT")).toEqual({
      title: "Findings",
      icon: null,
    });
  });

  test("an unchanged title writes nothing and announces nothing", async () => {
    await seed();
    const before = await row("AGENT");
    const block = await renamePage("AGENT", "Findings", {}, t.db);
    expect(await row("AGENT")).toEqual(before);
    expect(block.data).toEqual(before.data);
    expect(await announced()).toEqual([]);
  });

  test("a non-page row is a 400; an unknown one a 404", async () => {
    await seed();
    await refusedWith(renamePage("c1", "x", {}, t.db), 400);
    await refusedWith(renamePage("nope", "x", {}, t.db), 404);
  });
});
