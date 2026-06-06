import { and, eq, inArray } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import { bulkDeleteBlocks } from "../../core/endpoints";
import { _blocks } from "./tables";
import { blocksLiveResource } from "./resources";
import { blocksChanged } from "./tables-events";

export const handleBulkDeleteBlock = implement(
  bulkDeleteBlocks,
  async ({ params, body }) => {
    if (body.ids.length === 0) return { deleted: 0 };
    // A single DELETE..IN is atomic; FK cascade removes any descendants that
    // weren't themselves listed. Scoped to the document so stray ids can't
    // touch another doc.
    const deleted = await db
      .delete(_blocks)
      .where(
        and(
          eq(_blocks.documentId, params.documentId),
          inArray(_blocks.id, body.ids),
        ),
      )
      .returning({ id: _blocks.id });
    blocksLiveResource.notify({ documentId: params.documentId });
    await blocksChanged.emit({ documentId: params.documentId });
    return { deleted: deleted.length };
  },
);
