import { and, eq, isNull, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { db } from "@plugins/database/server";
import { HttpError } from "@plugins/infra/plugins/endpoints/server";
import type { RankExecutor } from "@plugins/primitives/plugins/rank/server";
import { _blocks } from "./tables";

/**
 * Any drizzle executor these reads can ride on: the global handle (production),
 * a transaction handle (every write path resolves its parent inside its own tx),
 * or a db-test-fixture throwaway DB. Wider than `RankExecutor` for the third
 * case only — `typeof db` carries a `$client: Pool` the fixture's plain
 * `NodePgDatabase` does not, so `RankExecutor` cannot express a testable read.
 * Same reason, same shape as `trash-blocks.ts`'s `BlockExecutor`.
 */
export type BlockReadExecutor =
  | NodePgDatabase
  | Parameters<Parameters<NodePgDatabase["transaction"]>[0]>[0];

export interface LiveParent {
  id: string;
  type: string;
  pageId: string | null;
}

/**
 * Resolve a write's DESTINATION `parentId` to its LIVE row — the single liveness
 * guard every path that accepts an externally-supplied parent goes through.
 *
 * `page_blocks` soft-deletes (`deleted_at` + `trash_entry_id`), so a trashed row
 * is still a real, FK-satisfying row: parenting a live block to it violates no
 * constraint and produces a **live block whose parent pointer names a trashed
 * row**. Neither delete nor restore can reach that state — the delete cascade
 * (`collect-subtree.ts`, which crosses page boundaries on purpose) trashes a
 * sub-page along with its container, and `untrashBlocks` re-parents a restored
 * root whose parent is gone to the workspace root. So it is not a user-facing
 * state to render; it is corruption, and the write boundary is where to refuse
 * it. See the "Unresolvable path" section of
 * `research/2026-07-16-page-sidebar-document-order.md`.
 *
 * A trashed block is **not addressable** — it appears in no resource, so no
 * client can legitimately name one — hence 404, the same answer an unknown id
 * gets. `parentId === null` (the workspace root) is legal and resolves to
 * `null`: there is no row to check.
 *
 * The two callers are the chokepoints, deliberately placed on a write's
 * MANDATORY read rather than bolted onto each handler's entry:
 *
 *  - `computePageId` — an INSERT cannot happen without resolving its `page_id`.
 *  - `loadLiveSiblings` (`forest.ts`) — a REPARENT cannot mint a rank without
 *    reading the destination sibling set.
 *
 * A future handler of either shape is therefore guarded by construction: it
 * would have to hand-roll BOTH lookups to get around it.
 */
export async function requireLiveParent(
  parentId: string | null,
  executor: BlockReadExecutor = db,
): Promise<LiveParent | null> {
  if (parentId === null) return null;
  const [parent] = await executor
    .select({ id: _blocks.id, type: _blocks.type, pageId: _blocks.pageId })
    .from(_blocks)
    .where(and(eq(_blocks.id, parentId), isNull(_blocks.deletedAt)))
    .limit(1);
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (!parent) throw new HttpError(404, `Block ${parentId} not found`);
  return parent;
}

// The denormalized nearest `type="page"` ancestor of a block, given its parent:
//   parent == null            -> null   (block is at the tree root)
//   parent.type === "page"    -> parent.id   (parent IS the page)
//   otherwise                 -> parent.pageId   (inherit the parent's page)
// Correct for both page children (a sub-page's nearest page ancestor is its
// parent page) and content children.
//
// THROWS 404 on a missing or trashed parent rather than returning null — see
// `requireLiveParent`. A null return now means exactly one thing: `parentId` was
// null. The old `!parent -> null` branch never produced a usable row anyway:
// `parent_id` is a self-FK, so the insert that followed it failed with a 500 FK
// violation. This is the guard for every INSERT path, because none of them can
// write a row without first resolving its `page_id`.
export async function computePageId(
  parentId: string | null,
  executor: BlockReadExecutor = db,
): Promise<string | null> {
  const parent = await requireLiveParent(parentId, executor);
  if (parent === null) return null;
  if (parent.type === "page") return parent.id;
  return parent.pageId;
}

// Recompute and persist `pageId` for `rootId` and its entire descendant subtree,
// propagating top-down from the (already-updated) parent of `rootId`. Call after
// any `parentId` change (move / bulk-move / indent / outdent / paste into a new
// parent). drizzle can't emit recursive CTEs, so we use a raw `WITH RECURSIVE`
// (mirrors collect-subtree.ts). The recursion derives each node's pageId from
// the rule above relative to its already-resolved parent.
export async function recomputePageIdSubtree(
  rootId: string,
  executor: RankExecutor = db,
): Promise<void> {
  await executor.execute(sql`
    WITH RECURSIVE resolved AS (
      -- Root: pageId derived from its current parent via the standard rule.
      SELECT
        b.id,
        b.type,
        CASE
          WHEN p.id IS NULL THEN NULL
          WHEN p.type = 'page' THEN p.id
          ELSE p.page_id
        END AS page_id
      FROM page_blocks b
      LEFT JOIN page_blocks p ON p.id = b.parent_id
      WHERE b.id = ${rootId}
      UNION ALL
      -- Children inherit from the already-resolved parent row.
      SELECT
        c.id,
        c.type,
        CASE
          WHEN r.type = 'page' THEN r.id
          ELSE r.page_id
        END AS page_id
      FROM page_blocks c
      JOIN resolved r ON c.parent_id = r.id
    )
    UPDATE page_blocks t
    SET page_id = resolved.page_id, updated_at = now()
    FROM resolved
    WHERE t.id = resolved.id
      AND t.page_id IS DISTINCT FROM resolved.page_id
  `);
}
