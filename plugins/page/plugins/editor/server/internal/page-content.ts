import { eq, and } from "drizzle-orm";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import type { RankExecutor } from "@plugins/primitives/plugins/rank/server";
import { db } from "@plugins/database/server";
import { PAGE_BLOCK_TYPE } from "../../core/schemas";
import type { PageData } from "../../core/schemas";
import type { SerializedBlock } from "../../core/serialized-block";
import { _blocks } from "./tables";
import { loadPageBlocks, insertForest } from "./forest";
import { pageData } from "../../core/schemas";
import { notifyBlockChange } from "./notify";

/**
 * A single stored content block, flattened to a portable row. Carries the
 * stable `id` + `parentId` so a consumer can both rebuild the tree and diff two
 * snapshots by identity (text edits keep the same id; structural splits mint
 * new ones). Domain-neutral: no rank math leaks out — `rank` is the raw stored
 * string, only meaningful for ordering siblings.
 */
export interface StoredBlock {
  id: string;
  parentId: string | null;
  type: string;
  data: unknown;
  rank: string;
  expanded: boolean;
}

/**
 * A portable snapshot of a page's full content: its page-level metadata plus
 * every content block as a flat row (with ids). General-purpose — usable for
 * version history, export, duplicate-page, and templating.
 */
export interface PageContentSnapshot {
  page: PageData;
  blocks: StoredBlock[];
}

/**
 * Serialize a page's full content (page-data + all content blocks) to a
 * portable {@link PageContentSnapshot}. Reuses {@link loadPageBlocks}; rows are
 * returned flat with their stable ids so callers can rebuild the tree or diff
 * by identity. Returns `null` if the page block doesn't exist (e.g. it was
 * deleted) so callers — like a debounced snapshot job — can skip cleanly rather
 * than treat a vanished page as an error.
 */
export async function serializePageContent(
  pageId: string,
  executor: RankExecutor = db,
): Promise<PageContentSnapshot | null> {
  const [pageBlock] = await executor
    .select()
    .from(_blocks)
    .where(and(eq(_blocks.id, pageId), eq(_blocks.type, PAGE_BLOCK_TYPE)))
    .limit(1);
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (!pageBlock) return null;
  const rows = await loadPageBlocks(pageId, executor);
  return {
    page: pageData(pageBlock),
    blocks: rows.map((r) => ({
      id: r.id,
      parentId: r.parentId,
      type: r.type,
      data: r.data,
      rank: r.rank,
      expanded: r.expanded,
    })),
  };
}

/**
 * Rebuild a `SerializedBlock[]` forest from flat stored rows, rooted at the
 * blocks whose `parentId` is the page itself (content top level). Siblings are
 * ordered by rank. Rows that don't connect to the page root are dropped (they
 * cannot be reached and would otherwise orphan).
 */
function rowsToForest(blocks: StoredBlock[], pageId: string): SerializedBlock[] {
  const childrenByParent = new Map<string | null, StoredBlock[]>();
  for (const b of blocks) {
    const key = b.parentId;
    const list = childrenByParent.get(key);
    if (list) list.push(b);
    else childrenByParent.set(key, [b]);
  }
  const build = (parentId: string | null): SerializedBlock[] => {
    const kids = childrenByParent.get(parentId) ?? [];
    return kids
      .slice()
      .sort((a, b) => Rank.compare(Rank.from(a.rank), Rank.from(b.rank)))
      .map((k) => ({
        type: k.type,
        data: k.data,
        expanded: k.expanded,
        children: build(k.id),
      }));
  };
  // Content top-level blocks are physically parented to the page block itself.
  return build(pageId);
}

/**
 * Transactionally REPLACE a page's full content from a {@link PageContentSnapshot}:
 * wipe current content blocks, restore the page-level metadata, and rebuild the
 * block forest under the page (minting fresh ids — matches the paste/duplicate
 * precedent). Emits the post-commit `blocksChanged` push so open editors and
 * downstream subscribers re-hydrate. Reverse of {@link serializePageContent}.
 *
 * General-purpose (history restore, page duplication, template apply). Does NOT
 * change any existing editor behavior — purely additive.
 *
 * **Content-doc invariant (per-block CRDT).** The fresh-id mint is
 * load-bearing: deleting every old content row FK-cascades
 * its `page_block_docs` state away, and the restored rows — being NEW ids with
 * no stored doc — re-seed their content docs client-side from the restored
 * `data.text` on next mount (the first-writer-wins doc-init path). Open
 * editors re-bind automatically: the `blocksChanged`/live push unmounts the
 * old ids' editors (their pending doc flushes 409-drop against the cascaded
 * rows; their `data.text` projections are `updateOnly` so they can never
 * resurrect a wiped row) and mounts the restored ones. If this function ever
 * changes to PRESERVE block ids, it must explicitly delete the affected
 * `page_block_docs` rows and push a rebind signal instead — otherwise a bound
 * `Y.Doc` would remain authoritative over the pre-restore text.
 */
export async function replacePageContent(
  pageId: string,
  snapshot: PageContentSnapshot,
): Promise<void> {
  const forest = rowsToForest(snapshot.blocks, pageId);
  await db.transaction(async (tx) => {
    // Wipe current content (FK cascade clears descendants). Scoped to this
    // page's content rows — the page block row itself is preserved.
    await tx.delete(_blocks).where(eq(_blocks.pageId, pageId));
    await tx
      .update(_blocks)
      .set({ data: snapshot.page, updatedAt: new Date() })
      .where(eq(_blocks.id, pageId));
    if (forest.length > 0) {
      const rootRanks = Rank.nBetween(null, null, forest.length);
      await insertForest(tx, { pageId, parentId: pageId, rootRanks, forest });
    }
  });
  await notifyBlockChange({ pageId, type: PAGE_BLOCK_TYPE, blockId: pageId });
}
