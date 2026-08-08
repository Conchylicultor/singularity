import { and, eq, isNull } from "drizzle-orm";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { turnIntoPage } from "../../core/endpoints";
import { newBlockId } from "../../core/block-id";
import { BlockSchema, PAGE_BLOCK_TYPE } from "../../core/schemas";
import { _blocks } from "./tables";
import { recomputePageIdSubtree } from "./page-id";
import { withPageForest } from "./page-forest";
import { insertBlocks, updateBlockFields } from "./forest-writer";
import { notifyBlockChange } from "./notify";
import { parseBlockData } from "./parse-block-data";

/**
 * "Turn into → Page": convert an existing content block into a sub-page **in
 * place**. The block keeps its id, its position in the sibling ordering, and its
 * children — it just becomes the `page` row, which the content editor renders as
 * an inline sub-page link. Its former text becomes the page title.
 *
 * This is the ONLY sanctioned in-place transition into `PAGE_BLOCK_TYPE`.
 * `handlePatchBlocks` rejects any `type` transition into or out of `page` with a
 * 409, because a blind row-level writer cannot maintain the `page_id` partition:
 * a `page` row owns every row keyed `page_id = <its id>`, and flipping the type
 * without re-scoping the descendants either orphans that content forever or
 * leaves the new page's children pointing at the outer page. Here the
 * `recomputePageIdSubtree` call inside the same transaction re-scopes them,
 * which is exactly what makes the transition representable. The two handlers are
 * distinct, so this path is naturally exempt from that guard.
 *
 * A page with no children renders nothing typeable (the first content block can
 * only be created by splitting an existing one), so a childless block is seeded
 * with one empty content block — same reason as `createPageWithSeed`. The seed's
 * `type` and `data` come from the REQUEST, not from this plugin: the editor must
 * not import a concrete block type (`@plugins/page/plugins/text`), which would
 * form an editor↔text cycle. That is the same seam `CreateBlockBodySchema.type`
 * already uses.
 */
export const handleTurnIntoPage = implement(
  turnIntoPage,
  async ({ params, body }) => {
    const [block] = await db
      .select({ pageId: _blocks.pageId, type: _blocks.type })
      .from(_blocks)
      .where(eq(_blocks.id, params.id))
      .limit(1);
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
    if (!block) throw new HttpError(404, "Block not found");
    if (block.type === PAGE_BLOCK_TYPE) {
      throw new HttpError(409, `Block ${params.id} is already a page`);
    }

    // Two forests change: the containing page's (one of its rows becomes a page
    // shell) and the block's own, which comes into existence here — every
    // descendant moves into the `page_id = params.id` partition.
    await withPageForest([block.pageId, params.id], async (ctx) => {
      await updateBlockFields(ctx.tx, params.id, {
        type: PAGE_BLOCK_TYPE,
        data: parseBlockData(PAGE_BLOCK_TYPE, {
          title: body.title,
          icon: null,
        }),
        // Turn into → Page folds deterministically, rather than inheriting
        // whatever the block had (e.g. an expanded toggle). A sub-page reads as
        // ONE row in its parent's flow — the point of promoting content into a
        // page is that the parent stops showing it — and the `collapsible:
        // "always"` chevron on the page row is the way back in.
        expanded: false,
        updatedAt: new Date(),
      });

      // Seeding is conditional on the block being childless, so a concurrent
      // insert would leave the page with both the new child and a stray seed. The
      // page lock subsumes the bespoke re-read-inside-the-tx this handler used to
      // hand-roll for exactly that TOCTOU: no concurrent structural write to
      // either forest can interleave here at all.
      const children = await ctx.tx
        .select({ id: _blocks.id })
        .from(_blocks)
        .where(and(eq(_blocks.parentId, params.id), isNull(_blocks.deletedAt)));

      if (children.length === 0) {
        await insertBlocks(ctx.tx, [
          {
            id: newBlockId(),
            // The new page is its own `page_id` scope; its content hangs off it.
            pageId: params.id,
            parentId: params.id,
            type: body.seedChild.type,
            data: parseBlockData(body.seedChild.type, body.seedChild.data),
            rank: Rank.between(null, null).toJSON(),
          },
        ]);
      }

      // The block just became a page, so every descendant's nearest `page` ancestor
      // changed: they move from the outer page's `page_id` partition into this
      // block's. Without this the children stay addressed to the outer page and
      // render as its content — the orphaning the patch guard exists to prevent.
      await recomputePageIdSubtree(ctx.tx, params.id);
    });

    const [row] = await db
      .select()
      .from(_blocks)
      .where(eq(_blocks.id, params.id))
      .limit(1);
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
    if (!row) throw new HttpError(500, "Block vanished during turn-into-page");

    // Emits for the new page's own id (its content list just appeared) AND for the
    // containing page, whose content list lost the block's subtree.
    await notifyBlockChange({
      pageId: row.pageId,
      type: PAGE_BLOCK_TYPE,
      blockId: row.id,
    });

    return BlockSchema.parse(row);
  },
);
