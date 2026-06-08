import { and, eq, inArray } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { _blocks, PAGE_BLOCK_TYPE } from "@plugins/page/plugins/editor/server";
import { PageLinks } from "./extractor";
import { backlinksResource } from "./resources";
import { _pageLinks } from "./tables";

// Rebuild the outgoing link edges for a single source page.
//
// 1. Load the page's content blocks (`pageId = pageId`).
// 2. Dispatch each block generically by `block.type` over the collected
//    extractors (collection-consumer separation — never names a block type).
// 3. Dedupe targets, drop self-references and ids that aren't `type="page"`
//    blocks.
// 4. Diff against the existing page_links rows for this source; insert added
//    edges, delete removed ones.
// 5. Notify `backlinksResource` for every affected target (old ∪ new) so
//    those pages' panels refresh live.
export async function reindexPage(pageId: string): Promise<void> {
  // type → extract, built fresh each call so newly-registered extractors are
  // always honored. `getContributions()` reads the populated server registry.
  const extractors = new Map<string, (data: unknown) => string[]>();
  for (const c of PageLinks.Extractor.getContributions()) {
    extractors.set(c.type, c.extract);
  }

  const blocks = await db
    .select({ type: _blocks.type, data: _blocks.data })
    .from(_blocks)
    .where(eq(_blocks.pageId, pageId));

  const targets = new Set<string>();
  for (const block of blocks) {
    const extract = extractors.get(block.type);
    if (!extract) continue;
    for (const id of extract(block.data)) {
      if (id && id !== pageId) targets.add(id);
    }
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

  // Affected targets = old ∪ new; notify each so its backlinks panel refreshes.
  const affected = new Set<string>([...oldTargets, ...validTargets]);
  for (const target of affected) {
    backlinksResource.notify({ pageId: target });
  }
}
