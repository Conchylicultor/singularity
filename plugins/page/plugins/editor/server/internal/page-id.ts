import { eq, sql } from "drizzle-orm";
import { db } from "@plugins/database/server";
import type { RankExecutor } from "@plugins/primitives/plugins/rank/server";
import { _blocks } from "./tables";

// The denormalized nearest `type="page"` ancestor of a block, given its parent:
//   parent == null            -> null   (block is at the tree root)
//   parent.type === "page"    -> parent.id   (parent IS the page)
//   otherwise                 -> parent.pageId   (inherit the parent's page)
// Correct for both page children (a sub-page's nearest page ancestor is its
// parent page) and content children.
export async function computePageId(
  parentId: string | null,
  executor: RankExecutor = db,
): Promise<string | null> {
  if (parentId === null) return null;
  const [parent] = await executor
    .select({ id: _blocks.id, type: _blocks.type, pageId: _blocks.pageId })
    .from(_blocks)
    .where(eq(_blocks.id, parentId))
    .limit(1);
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (!parent) return null;
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
