import { and, eq, isNull } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { moveBlock } from "../../core/endpoints";
import { BlockSchema } from "../../core/schemas";
import { _blocks } from "./tables";
import { blocksChanged } from "./tables-events";
import { rankAdjacentTo } from "./forest";
import { recomputePageIdSubtree } from "./page-id";

export const handleMoveBlock = implement(moveBlock, async ({ params, body }) => {
  if (body.parentId === params.id) {
    throw new HttpError(400, "Cannot parent a block to itself");
  }
  if (body.targetId === params.id) {
    throw new HttpError(400, "Cannot position a block relative to itself");
  }

  // Read the destination sibling set and write the new rank in ONE transaction:
  // the rank is minted against a consistent snapshot, so a concurrent insert
  // under the same parent cannot slip between the read and the write. Mirrors
  // the queue's `handle-reorder.ts`.
  const { before, row } = await db.transaction(async (tx) => {
    const [before] = await tx
      .select({ id: _blocks.id, pageId: _blocks.pageId, type: _blocks.type })
      .from(_blocks)
      .where(eq(_blocks.id, params.id))
      .limit(1);
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
    if (!before) throw new HttpError(404, "Not found");

    // EVERY LIVE row under the destination parent — not scoped by `page_id`, not
    // filtered by `type`, but excluding trashed rows: `(parent_id, rank)` is one
    // ordering space shared by sub-page rows and content rows, but the partial
    // unique index only constrains LIVE rows, so a trashed row may legitimately
    // share a live row's rank. Including it would hand `rankAdjacentTo` two
    // siblings at one rank and abort with `Rank.between(r, r)`.
    const siblings = await tx
      .select()
      .from(_blocks)
      .where(
        body.parentId === null
          ? and(isNull(_blocks.parentId), isNull(_blocks.deletedAt))
          : and(eq(_blocks.parentId, body.parentId), isNull(_blocks.deletedAt)),
      );
    if (body.targetId !== null && !siblings.some((s) => s.id === body.targetId)) {
      throw new HttpError(
        400,
        `Target ${body.targetId} is not a child of the destination parent`,
      );
    }
    const rank = rankAdjacentTo(
      siblings,
      body.parentId,
      body.targetId,
      body.zone,
      new Set([params.id]),
    );

    await tx
      .update(_blocks)
      .set({
        parentId: body.parentId,
        rank: rank.toJSON(),
        updatedAt: new Date(),
      })
      .where(eq(_blocks.id, params.id));
    // Reparenting may move the block (and its subtree) into a different page.
    await recomputePageIdSubtree(params.id, tx);
    if (body.parentId) {
      await tx
        .update(_blocks)
        .set({ expanded: true, updatedAt: new Date() })
        .where(eq(_blocks.id, body.parentId));
    }

    const [row] = await tx
      .select()
      .from(_blocks)
      .where(eq(_blocks.id, params.id))
      .limit(1);
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
    if (!row) throw new HttpError(404, "Not found after move");
    return { before, row };
  });

  // Fan out to reindex subscribers for both the old and the (possibly new) page
  // scope, deduped. The page_blocks content + sidebar live resources invalidate
  // via the L4 DB change-feed on the move write.
  const affected = new Set<string>();
  if (before.pageId !== null) affected.add(before.pageId);
  if (row.pageId !== null) affected.add(row.pageId);
  for (const pageId of affected) {
    await blocksChanged.emit({ pageId });
  }

  return BlockSchema.parse(row);
});
