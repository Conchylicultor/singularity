import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { _blocks, PAGE_BLOCK_TYPE } from "@plugins/page/plugins/editor/server";
import { PageLinks } from "./extractor";
import { _pageLinks } from "./tables";

// Rebuild the outgoing link edges for a single source page.
//
// 1. Load the page's content blocks (`pageId = pageId`).
// 2. Dispatch each block generically by `block.type` over the collected
//    extractors (collection-consumer separation — never names a block type).
// 3. Dedupe targets, drop self-references and ids that aren't `type="page"`
//    blocks.
// 4. Diff against the existing page_links rows for this source; insert added
//    edges, delete removed ones. Each affected target's backlinks panel
//    refreshes automatically — the page_links insert/delete is invalidated by
//    the L4 DB change-feed, which fans out to every dependent backlinksResource.
export async function reindexPage(pageId: string): Promise<void> {
  // Built fresh each call so newly-registered extractors are always honored.
  // `getContributions()` reads the populated server registry. Typed extractors
  // run on their matching block type; global (type-less) ones run on every block.
  const extractors = new Map<string, (data: unknown) => string[]>();
  const globalExtractors: ((data: unknown) => string[])[] = [];
  for (const c of PageLinks.Extractor.getContributions()) {
    if (c.type === undefined) globalExtractors.push(c.extract);
    else extractors.set(c.type, c.extract);
  }

  const blocks = await db
    .select({ type: _blocks.type, data: _blocks.data })
    .from(_blocks)
    .where(and(eq(_blocks.pageId, pageId), isNull(_blocks.deletedAt)));

  const targets = new Set<string>();
  const collect = (extract: (data: unknown) => string[], data: unknown) => {
    for (const id of extract(data)) {
      if (id && id !== pageId) targets.add(id);
    }
  };
  for (const block of blocks) {
    const extract = extractors.get(block.type);
    if (extract) collect(extract, block.data);
    for (const g of globalExtractors) collect(g, block.data);
  }

  // Validate targets against pages — drop links to non-existent / non-page ids.
  let validTargets = new Set<string>();
  if (targets.size > 0) {
    const existing = await db
      .select({ id: _blocks.id })
      .from(_blocks)
      .where(
        and(
          inArray(_blocks.id, [...targets]),
          eq(_blocks.type, PAGE_BLOCK_TYPE),
          isNull(_blocks.deletedAt),
        ),
      );
    validTargets = new Set(existing.map((r) => r.id));
  }

  const existingEdges = await db
    .select({ targetPageId: _pageLinks.targetPageId })
    .from(_pageLinks)
    .where(eq(_pageLinks.sourcePageId, pageId));
  const oldTargets = new Set(existingEdges.map((r) => r.targetPageId));

  const toInsert = [...validTargets].filter((t) => !oldTargets.has(t));
  const toDelete = [...oldTargets].filter((t) => !validTargets.has(t));

  if (toInsert.length > 0) {
    await db.insert(_pageLinks).values(
      toInsert.map((targetPageId) => ({
        sourcePageId: pageId,
        targetPageId,
      })),
    );
  }
  if (toDelete.length > 0) {
    await db
      .delete(_pageLinks)
      .where(
        and(
          eq(_pageLinks.sourcePageId, pageId),
          inArray(_pageLinks.targetPageId, toDelete),
        ),
      );
  }
}
