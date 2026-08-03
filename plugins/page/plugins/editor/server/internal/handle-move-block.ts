import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { rankAdjacentTo } from "@plugins/primitives/plugins/rank/server";
import { moveBlock } from "../../core/endpoints";
import { BlockSchema } from "../../core/schemas";
import { _blocks } from "./tables";
import { blocksChanged } from "./tables-events";
import { loadLiveSiblings } from "./forest";
import { withPageForest } from "./page-forest";
import { updateBlockFields } from "./forest-writer";
import { computePageId, recomputePageIdSubtree } from "./page-id";

export const handleMoveBlock = implement(moveBlock, async ({ params, body }) => {
  if (body.parentId === params.id) {
    throw new HttpError(400, "Cannot parent a block to itself");
  }
  if (body.targetId === params.id) {
    throw new HttpError(400, "Cannot position a block relative to itself");
  }

  // Name the two forests this move permutes — the block's own page and the
  // destination's — so BOTH are locked and a cross-page move is atomic against
  // each page's op stream. Read outside the lock deliberately: it decides which
  // locks to take, never what to write, and everything authoritative is re-read
  // under them. (`computePageId` is also the destination's liveness guard, so a
  // trashed or missing parent still 404s.)
  const [source] = await db
    .select({ pageId: _blocks.pageId })
    .from(_blocks)
    .where(eq(_blocks.id, params.id))
    .limit(1);
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (!source) throw new HttpError(404, "Not found");
  const destPageId = await computePageId(body.parentId);

  // The page lock subsumes the bespoke read-the-siblings-inside-the-tx defence
  // this handler used to hand-roll: every read here is already under it.
  const { value } = await withPageForest([source.pageId, destPageId], async (ctx) => {
    const [before] = await ctx.tx
      .select({ id: _blocks.id, pageId: _blocks.pageId, type: _blocks.type })
      .from(_blocks)
      .where(eq(_blocks.id, params.id))
      .limit(1);
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
    if (!before) throw new HttpError(404, "Not found");

    // Guards that the destination parent is LIVE (404 otherwise) and returns its
    // complete live sibling set for the rank math — see `loadLiveSiblings`.
    const siblings = await loadLiveSiblings(ctx.tx, body.parentId);
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

    await updateBlockFields(ctx.tx, params.id, {
      parentId: body.parentId,
      rank: rank.toJSON(),
      updatedAt: new Date(),
    });
    // Reparenting may move the block (and its subtree) into a different page.
    await recomputePageIdSubtree(ctx.tx, params.id);
    if (body.parentId) {
      await updateBlockFields(ctx.tx, body.parentId, {
        expanded: true,
        updatedAt: new Date(),
      });
    }

    const [row] = await ctx.tx
      .select()
      .from(_blocks)
      .where(eq(_blocks.id, params.id))
      .limit(1);
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
    if (!row) throw new HttpError(404, "Not found after move");
    return { before, row };
  });
  const { before, row } = value;

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
