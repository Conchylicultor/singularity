import { and, eq, inArray, isNull } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { db } from "@plugins/database/server";
import { nextRankUnder } from "@plugins/primitives/plugins/rank/server";
import {
  recordTrashEntry,
  _trashEntries,
} from "@plugins/infra/plugins/trash/server";
import type { TrashEntry } from "@plugins/infra/plugins/trash/core";
import { PAGE_BLOCK_TYPE, pageData } from "../../core/schemas";
import { _blocks } from "./tables";
import type { BlockRow } from "./forest";
import { collectBlockSubtrees } from "./collect-subtree";
import { BlockLifecycle } from "./document-hooks";
import { blocksChanged } from "./tables-events";

// The trash source id this plugin registers (see server/index.ts). Kept local so
// the chokepoint and the source registration name it once.
export const PAGES_TRASH_SOURCE = "pages";

// Any drizzle executor the chokepoint can ride on: the global handle (production)
// or a db-test-fixture's throwaway DB (tests). It must support `.transaction`, so
// a transaction handle is NOT accepted — the chokepoint owns its own tx.
type BlockExecutor = NodePgDatabase;
// The handle passed to a `.transaction` callback (no nested `.transaction`).
type BlockTx = Parameters<Parameters<NodePgDatabase["transaction"]>[0]>[0];

const parentEq = (parentId: string | null) =>
  parentId === null ? isNull(_blocks.parentId) : eq(_blocks.parentId, parentId);

async function runBeforeDelete(
  blockIds: string[],
): Promise<Array<() => void | Promise<void>>> {
  const after: Array<() => void | Promise<void>> = [];
  for (const hook of BlockLifecycle.BeforeDelete.getContributions()) {
    const cb = await hook.beforeDelete(blockIds);
    if (cb) after.push(cb);
  }
  return after;
}

async function runOnTrash(blockIds: string[]): Promise<void> {
  for (const hook of BlockLifecycle.OnTrash.getContributions()) {
    await hook.onTrash(blockIds);
  }
}

async function runOnRestore(blockIds: string[]): Promise<void> {
  for (const hook of BlockLifecycle.OnRestore.getContributions()) {
    await hook.onRestore(blockIds);
  }
}

/**
 * THE single delete chokepoint every page delete path funnels through.
 *
 * Policy (see the plan doc): a delete whose collected cascade set contains any
 * `type="page"` block is **trashed** (soft delete — `deleted_at` set, FK cascades
 * never fire, so descendants, `page_block_docs`, side-tables, and version history
 * all survive); a page-free set stays a **hard delete** (today's behavior). This
 * is because a page's own content is keyed `page_id = <that page>`, so a cascade
 * on a page row crosses the client's visibility boundary and destroys content the
 * client can neither see nor restore via undo — the exact 2026-07-10 incident.
 *
 * On the trash path each `type="page"` ROOT gets its own independently-restorable
 * `trash_entries` row (a bulk delete of two sub-pages ⇒ two entries); non-page
 * roots (and any subtree not under a page root) fold into the first entry so a
 * single operation restores together.
 */
export async function deleteBlocksSubtree(
  rootIds: string[],
  executor: BlockExecutor = db,
): Promise<{ trashed: boolean }> {
  if (rootIds.length === 0) return { trashed: false };
  const subtreeIds = await collectBlockSubtrees(rootIds, executor);
  if (subtreeIds.length === 0) return { trashed: false };
  const rows = (await executor
    .select()
    .from(_blocks)
    .where(inArray(_blocks.id, subtreeIds))) as BlockRow[];
  const rowById = new Map(rows.map((r) => [r.id, r]));
  const existingRootIds = rootIds.filter((id) => rowById.has(id));
  if (existingRootIds.length === 0) return { trashed: false };

  const hasPage = rows.some((r) => r.type === PAGE_BLOCK_TYPE);

  if (!hasPage) {
    // Page-free delete set → HARD path (unchanged behavior): run BeforeDelete
    // hooks over the full cascade set, DELETE the roots, cascade clears the rest.
    const afterCallbacks = await runBeforeDelete(subtreeIds);
    await executor.delete(_blocks).where(inArray(_blocks.id, existingRootIds));
    for (const after of afterCallbacks) await after();
    return { trashed: false };
  }

  // --- Trash path ------------------------------------------------------------
  // Walk each root's subtree from the already-loaded rows (no extra DB round
  // trips), so entry assignment stays a pure in-memory partition.
  const childrenByParent = new Map<string | null, BlockRow[]>();
  for (const r of rows) {
    const list = childrenByParent.get(r.parentId);
    if (list) list.push(r);
    else childrenByParent.set(r.parentId, [r]);
  }
  const subtreeOf = (rootId: string): string[] => {
    const out: string[] = [];
    const stack = [rootId];
    while (stack.length > 0) {
      const id = stack.pop()!;
      if (!rowById.has(id)) continue;
      out.push(id);
      for (const child of childrenByParent.get(id) ?? []) stack.push(child.id);
    }
    return out;
  };

  const pageRootIds = existingRootIds.filter(
    (id) => rowById.get(id)!.type === PAGE_BLOCK_TYPE,
  );
  const nonPageRootIds = existingRootIds.filter(
    (id) => rowById.get(id)!.type !== PAGE_BLOCK_TYPE,
  );

  // Flag a set of rows under one entry — but only rows still LIVE, so an
  // already-trashed nested page keeps its own entry's `trash_entry_id` ownership
  // (restoring the outer entry then leaves the inner one trashed).
  const flagTrashed = async (
    tx: BlockTx,
    ids: string[],
    entryId: string,
  ): Promise<void> => {
    if (ids.length === 0) return;
    await tx
      .update(_blocks)
      .set({ deletedAt: new Date(), trashEntryId: entryId })
      .where(and(inArray(_blocks.id, ids), isNull(_blocks.deletedAt)));
  };

  await executor.transaction(async (tx) => {
    const claimed = new Set<string>();
    let firstEntryId: string | null = null;

    for (const pageRootId of pageRootIds) {
      const label = pageData(rowById.get(pageRootId)!).title || "Untitled";
      const entryId = await recordTrashEntry(tx, {
        sourceId: PAGES_TRASH_SOURCE,
        rootEntityId: pageRootId,
        label,
      });
      if (firstEntryId === null) firstEntryId = entryId;
      const ids = subtreeOf(pageRootId).filter((id) => !claimed.has(id));
      for (const id of ids) claimed.add(id);
      await flagTrashed(tx, ids, entryId);
    }

    const leftover = subtreeIds.filter((id) => !claimed.has(id));
    if (leftover.length > 0) {
      if (firstEntryId === null) {
        // No page ROOT among the selection, but a page is nested under a
        // non-page root. Anchor one entry on the first requested root; label it
        // from the first nested page's title so the Trash UI reads sensibly.
        const anchorId = nonPageRootIds[0] ?? existingRootIds[0]!;
        const nestedPage = rows.find((r) => r.type === PAGE_BLOCK_TYPE);
        const label = nestedPage
          ? pageData(nestedPage).title || "Untitled"
          : "Blocks";
        firstEntryId = await recordTrashEntry(tx, {
          sourceId: PAGES_TRASH_SOURCE,
          rootEntityId: anchorId,
          label,
        });
      }
      await flagTrashed(tx, leftover, firstEntryId);
    }
  });

  await runOnTrash(subtreeIds);
  return { trashed: true };
}

/**
 * Restore an entry's flagged subtree (the trash source's `restore` callback, and
 * the undo path in the patch handler). Un-flags exactly the rows carrying this
 * entry's id — no re-walk, so it never over-restores an independently-trashed
 * nested page. Repairs a restored ROOT whose slot was taken while it was trashed,
 * and reparents a root whose original parent has since vanished. Idempotent: a
 * second call finds nothing flagged and no-ops.
 */
export async function untrashBlocks(
  entry: TrashEntry,
  executor: BlockExecutor = db,
): Promise<void> {
  const restoredIds: string[] = [];
  const affectedPageIds = new Set<string>();

  await executor.transaction(async (tx) => {
    const flagged = (await tx
      .select()
      .from(_blocks)
      .where(eq(_blocks.trashEntryId, entry.id))) as BlockRow[];
    if (flagged.length === 0) return;
    for (const r of flagged) restoredIds.push(r.id);

    const flaggedIds = new Set(flagged.map((r) => r.id));
    const roots = flagged.filter(
      (r) => r.parentId === null || !flaggedIds.has(r.parentId),
    );
    const rootIdSet = new Set(roots.map((r) => r.id));

    for (const root of roots) {
      let targetParentId = root.parentId;
      let targetPageId = root.pageId;
      let targetRank = root.rank;

      if (root.parentId !== null) {
        const [parent] = await tx
          .select({ id: _blocks.id, deletedAt: _blocks.deletedAt })
          .from(_blocks)
          .where(eq(_blocks.id, root.parentId))
          .limit(1);
        const parentGone = !parent || parent.deletedAt !== null;
        if (parentGone) {
          // Original parent purged or still trashed → reparent to the workspace
          // root so the restored subtree stays reachable. A `type="page"` root
          // becomes a root page (pageId null); its own content keeps
          // `page_id = <root>`, so the subtree is unaffected.
          targetParentId = null;
          targetPageId = null;
          targetRank = (
            await nextRankUnder(_blocks, _blocks.parentId, null, tx)
          ).toJSON();
        }
      }

      if (targetParentId === root.parentId) {
        // Rank-collision repair (roots only — subtree-internal ranks are safe).
        // A live sibling may have claimed the root's `(parent_id, rank)` while it
        // was trashed; the partial unique index would reject the un-flag. The
        // root itself is still trashed here, so `deleted_at IS NULL` excludes it.
        const [collision] = await tx
          .select({ id: _blocks.id })
          .from(_blocks)
          .where(
            and(
              isNull(_blocks.deletedAt),
              parentEq(targetParentId),
              eq(_blocks.rank, root.rank),
            ),
          )
          .limit(1);
        if (collision) {
          targetRank = (
            await nextRankUnder(_blocks, _blocks.parentId, targetParentId, tx)
          ).toJSON();
        }
      }

      if (root.pageId !== null) affectedPageIds.add(root.pageId);
      if (targetPageId !== null) affectedPageIds.add(targetPageId);
      if (root.type === PAGE_BLOCK_TYPE) affectedPageIds.add(root.id);

      await tx
        .update(_blocks)
        .set({
          deletedAt: null,
          trashEntryId: null,
          parentId: targetParentId,
          pageId: targetPageId,
          rank: targetRank,
          updatedAt: new Date(),
        })
        .where(eq(_blocks.id, root.id));
    }

    const nonRootRows = flagged.filter((r) => !rootIdSet.has(r.id));
    if (nonRootRows.length > 0) {
      // Subtree-internal rows: clear flags in bulk. Their `(parent_id, rank)`
      // pairs were never contended by a live row (they moved as one body).
      await tx
        .update(_blocks)
        .set({ deletedAt: null, trashEntryId: null })
        .where(inArray(_blocks.id, nonRootRows.map((r) => r.id)));
      for (const r of nonRootRows) {
        if (r.pageId !== null) affectedPageIds.add(r.pageId);
      }
    }
  });

  if (restoredIds.length === 0) return;

  await runOnRestore(restoredIds);
  // The page_blocks live resources refresh automatically via the L4 change-feed
  // on the un-flag UPDATE; this fans out the cross-plugin `blocksChanged` event
  // so search / links / reminders re-derive. Rides `executor` so a test DB emits
  // against its own (subscriber-less) trigger table — a no-op there.
  for (const pageId of affectedPageIds) {
    await blocksChanged.emit({ pageId }, { tx: executor });
  }
}

/**
 * Purge (permanent hard-delete) a batch of trashed entries — the trash source's
 * `purge` callback, run by the retention sweep at 30 days OR by "Delete
 * permanently". For each entry: collect its still-trashed subtree (roots +
 * descendants), fire the BeforeDelete hooks over the FULL set (so
 * `deleteVersions` / search deindex run — purge IS the deferred hard delete),
 * then DELETE the roots so the FK cascades finally reclaim content,
 * `page_block_docs`, `page_links`, ext side-tables, and attachment links.
 * Idempotent: an entry whose rows are already gone is skipped.
 */
export async function purgeTrashedPages(
  entries: TrashEntry[],
  executor: BlockExecutor = db,
): Promise<void> {
  for (const entry of entries) {
    const flagged = (await executor
      .select({ id: _blocks.id, parentId: _blocks.parentId })
      .from(_blocks)
      .where(eq(_blocks.trashEntryId, entry.id))) as Array<{
      id: string;
      parentId: string | null;
    }>;
    if (flagged.length === 0) continue; // already purged or restored

    const flaggedIds = new Set(flagged.map((r) => r.id));
    const rootIds = flagged
      .filter((r) => r.parentId === null || !flaggedIds.has(r.parentId))
      .map((r) => r.id);

    // The full cascade set for the destroy hooks — collectBlockSubtrees walks
    // `parent_id` and deliberately keeps seeing trashed rows.
    const subtreeIds = await collectBlockSubtrees(rootIds, executor);
    const afterCallbacks = await runBeforeDelete(subtreeIds);
    await executor.delete(_blocks).where(inArray(_blocks.id, rootIds));
    for (const after of afterCallbacks) await after();
  }
}
