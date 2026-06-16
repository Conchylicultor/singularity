import { and, eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { _blocks, PAGE_BLOCK_TYPE, pageData } from "@plugins/page/plugins/editor/server";
import { textOf, type Block } from "@plugins/page/plugins/editor/core";
import { upsertSearchDocs, deleteSearchDocs } from "@plugins/search/plugins/engine/server";

const SOURCE = "pages";

// Rebuild the search document for a single page.
//
// 1. Load the page block (the `type="page"` row whose id is the pageId) and all
//    of its content blocks (`pageId = pageId`).
// 2. If the page block is gone (deleted between the blocksChanged emit and this
//    run), wipe its doc and return — same self-heal the delete hook gives us,
//    but resilient to a reindex racing a delete.
// 3. Derive title (page block's title) + body (content blocks' plain text) and
//    upsert. The page block itself carries the title but no body text, so it is
//    excluded from `body`; the engine weights `title` above `body` so a
//    title-only match still surfaces the page.
//
// Diff-free upsert (replace-on-conflict), so re-running is idempotent.
export async function reindexPageSearch(pageId: string): Promise<void> {
  const pageRows = await db
    .select()
    .from(_blocks)
    .where(and(eq(_blocks.id, pageId), eq(_blocks.type, PAGE_BLOCK_TYPE)));
  const pageBlock = pageRows[0] as Block | undefined;

  if (!pageBlock) {
    await deleteSearchDocs(SOURCE, [pageId]);
    return;
  }

  const contentBlocks = await db
    .select({ type: _blocks.type, data: _blocks.data })
    .from(_blocks)
    .where(eq(_blocks.pageId, pageId));

  const data = pageData(pageBlock);
  const title = data.title || "Untitled";
  const body = contentBlocks
    .map((b) => textOf(b))
    .filter((t) => t.length > 0)
    .join("\n");

  await upsertSearchDocs([
    {
      source: SOURCE,
      entityId: pageId,
      title,
      body,
      route: "/pages/page/" + pageId,
      metadata: { iconSvgNodes: data.iconSvgNodes },
    },
  ]);
}
