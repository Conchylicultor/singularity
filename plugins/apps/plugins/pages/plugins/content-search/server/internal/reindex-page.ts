import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { _blocks, PAGE_BLOCK_TYPE, pageData } from "@plugins/page/plugins/editor/server";
import { textOf, type Block } from "@plugins/page/plugins/editor/core";
import { upsertSearchDocs, deleteSearchDocs } from "@plugins/search/plugins/engine/server";
import type { SearchDoc } from "@plugins/search/plugins/engine/core";

// The search source id this plugin owns. Exported so the backfill reads back the
// exact same source's indexed docs.
export const SOURCE = "pages";

// The freshly-derived search document for a page plus a content fingerprint of
// everything that document encodes. The fingerprint is stamped into the doc's
// `metadata` so a later run can compare it against what is already indexed and
// skip re-upserting an unchanged page.
export interface BuiltPageSearchDoc {
  doc: SearchDoc;
  contentHash: string;
}

// Derive the search document for a single page from its blocks.
//
// 1. Load the page block (the `type="page"` row whose id is the pageId) and all
//    of its content blocks (`pageId = pageId`).
// 2. Return `null` if the page block is gone (deleted between a blocksChanged
//    emit / backfill enumeration and this read) — the caller wipes the doc.
// 3. Derive title (page block's title) + body (content blocks' plain text). The
//    page block itself carries the title but no body text, so it is excluded
//    from `body`; the engine weights `title` above `body` so a title-only match
//    still surfaces the page.
//
// The `contentHash` is a sha256 over exactly what the indexed doc encodes —
// title, body, and the icon SVG nodes carried in metadata — so ANY change that
// would alter the stored doc (content edit, title rename, icon swap) changes the
// hash, and nothing else does. This is the skip-if-unchanged signal.
export async function buildPageSearchDoc(pageId: string): Promise<BuiltPageSearchDoc | null> {
  const pageRows = await db
    .select()
    .from(_blocks)
    .where(and(eq(_blocks.id, pageId), eq(_blocks.type, PAGE_BLOCK_TYPE)));
  const pageBlock = pageRows[0] as Block | undefined;

  if (!pageBlock) return null;

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
  const iconSvgNodes = data.iconSvgNodes;

  const contentHash = createHash("sha256")
    .update(JSON.stringify({ title, body, iconSvgNodes: iconSvgNodes ?? null }))
    .digest("hex");

  return {
    contentHash,
    doc: {
      source: SOURCE,
      entityId: pageId,
      title,
      body,
      route: "/pages/page/" + pageId,
      metadata: { iconSvgNodes, contentHash },
    },
  };
}

// Rebuild the search document for a single page (the steady-state
// `blocksChanged`-triggered path). Diff-free upsert (replace-on-conflict), so
// re-running is idempotent; a delete self-heals a reindex racing a page delete.
// The upserted doc carries the content fingerprint in `metadata`, which the
// boot backfill reads back to decide what it can skip.
export async function reindexPageSearch(pageId: string): Promise<void> {
  const built = await buildPageSearchDoc(pageId);
  if (!built) {
    await deleteSearchDocs(SOURCE, [pageId]);
    return;
  }
  await upsertSearchDocs([built.doc]);
}
