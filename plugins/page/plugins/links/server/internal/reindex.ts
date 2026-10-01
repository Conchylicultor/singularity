import { and, eq, inArray, or } from "drizzle-orm";
import { db } from "@plugins/database/server";
import {
  liveBlocks,
  PAGE_BLOCK_TYPE,
} from "@plugins/page/plugins/editor/server";
import { PageLinks } from "./extractor";
import { _pageLinks } from "./tables";

// Rebuild the outgoing link edges for a single source page.
//
// 1. Load the page's content blocks (`pageId = pageId`).
// 2. Dispatch each block generically by `block.type` over the collected
//    extractors (collection-consumer separation — never names a block type),
//    recording WHICH block each link came from: an edge is (target, block).
// 3. Drop self-references and ids that aren't `type="page"` blocks.
// 4. Diff against the existing page_links rows for this source; insert added
//    edges, delete removed ones. Each affected target's backlinks panel
//    refreshes automatically — the page_links insert/delete is invalidated by
//    the L4 DB change-feed, which recomputes every subscribed `pageBacklinks`
//    tuple.
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
    .select({ id: liveBlocks.id, type: liveBlocks.type, data: liveBlocks.data })
    .from(liveBlocks)
    .where(eq(liveBlocks.pageId, pageId));

  // `edgeKey(target, block)` → the edge, deduped (two extractors, or one
  // extractor naming a target twice, still make one edge per block).
  const found = new Map<string, Edge>();
  const collect = (
    extract: (data: unknown) => string[],
    block: { id: string; data: unknown },
  ) => {
    for (const targetPageId of extract(block.data)) {
      if (!targetPageId || targetPageId === pageId) continue;
      const edge = { targetPageId, sourceBlockId: block.id };
      found.set(edgeKey(edge), edge);
    }
  };
  for (const block of blocks) {
    const extract = extractors.get(block.type);
    if (extract) collect(extract, block);
    for (const g of globalExtractors) collect(g, block);
  }

  // Validate targets against pages — drop links to non-existent / non-page ids.
  const targets = new Set([...found.values()].map((e) => e.targetPageId));
  let validTargets = new Set<string>();
  if (targets.size > 0) {
    const existing = await db
      .select({ id: liveBlocks.id })
      .from(liveBlocks)
      .where(
        and(
          inArray(liveBlocks.id, [...targets]),
          eq(liveBlocks.type, PAGE_BLOCK_TYPE),
        ),
      );
    validTargets = new Set(existing.map((r) => r.id));
  }
  const next = new Map(
    [...found].filter(([, e]) => validTargets.has(e.targetPageId)),
  );

  const existingEdges = await db
    .select({
      targetPageId: _pageLinks.targetPageId,
      sourceBlockId: _pageLinks.sourceBlockId,
    })
    .from(_pageLinks)
    .where(eq(_pageLinks.sourcePageId, pageId));
  const old = new Map(existingEdges.map((e) => [edgeKey(e), e]));

  const toInsert = [...next].filter(([k]) => !old.has(k)).map(([, e]) => e);
  const toDelete = [...old].filter(([k]) => !next.has(k)).map(([, e]) => e);

  if (toInsert.length > 0) {
    await db
      .insert(_pageLinks)
      .values(toInsert.map((e) => ({ sourcePageId: pageId, ...e })));
  }
  if (toDelete.length > 0) {
    await db
      .delete(_pageLinks)
      .where(
        and(
          eq(_pageLinks.sourcePageId, pageId),
          or(
            ...toDelete.map((e) =>
              and(
                eq(_pageLinks.targetPageId, e.targetPageId),
                eq(_pageLinks.sourceBlockId, e.sourceBlockId),
              ),
            ),
          ),
        ),
      );
  }
}

interface Edge {
  targetPageId: string;
  sourceBlockId: string;
}

/** One spelling of an edge's identity within its source page. */
const edgeKey = (e: Edge): string =>
  `${e.targetPageId}\u0000${e.sourceBlockId}`;
