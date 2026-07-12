import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import type { TrashOutcome } from "@plugins/infra/plugins/trash/core";
import { deleteBlock } from "../../core/endpoints";
import { PAGES_TRASH_SOURCE } from "../../core/schemas";
import { _blocks } from "./tables";
import { blocksChanged } from "./tables-events";
import { deleteBlocksSubtree } from "./trash-blocks";

// The explicit `Promise<TrashOutcome>` return annotation is load-bearing: without
// it TS widens the two literal branches into `{ trashed: boolean; sourceId?: … }`,
// which no longer matches the endpoint's discriminated response schema.
export const handleDeleteBlock = implement(
  deleteBlock,
  async ({ params }): Promise<TrashOutcome> => {
    const [target] = await db
      .select({ id: _blocks.id, pageId: _blocks.pageId, type: _blocks.type })
      .from(_blocks)
      .where(eq(_blocks.id, params.id))
      .limit(1);
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
    if (!target) throw new HttpError(404, "Not found");

    // The single delete chokepoint: a subtree containing a `type="page"` block is
    // trashed (soft delete — the FK cascade never fires, so descendants +
    // page_block_docs + history survive), a page-free subtree is hard-deleted
    // exactly as before. It runs the BeforeDelete / OnTrash lifecycle hooks.
    const outcome = await deleteBlocksSubtree([params.id]);

    // The deleted/trashed block's content list lost a row. Fan out to reindex
    // subscribers for its containing page; the page_blocks live resources
    // invalidate via the L4 DB change-feed on the underlying write.
    if (target.pageId !== null) {
      await blocksChanged.emit({ pageId: target.pageId });
    }

    if (!outcome.trashed) return { trashed: false };

    // ONE root ⇒ exactly one entry: a page root mints its own entry, and any
    // leftover rows fold into that first entry (see `deleteBlocksSubtree`). The
    // caller gets that ledger handle so it can offer an Undo (restore).
    const entryId = outcome.entryIds[0];
    if (entryId === undefined) {
      throw new HttpError(500, "Trashed subtree produced no trash entry");
    }
    return { trashed: true, sourceId: PAGES_TRASH_SOURCE, entryId };
  },
);
