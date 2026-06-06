import { eq } from "drizzle-orm";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { pasteBlocks } from "../../core/endpoints";
import { _documents } from "./tables";
import { blocksLiveResource } from "./resources";
import { blocksChanged } from "./tables-events";
import { insertForest, loadDocBlocks, rankWindow } from "./forest";

const EMPTY = new Set<string>();

export const handlePasteBlock = implement(
  pasteBlocks,
  async ({ params, body }) => {
    if (body.blocks.length === 0) return { rootIds: [] };

    const [doc] = await db
      .select({ id: _documents.id })
      .from(_documents)
      .where(eq(_documents.id, params.documentId))
      .limit(1);
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
    if (!doc) throw new HttpError(404, "Document not found");

    const rows = await loadDocBlocks(params.documentId);
    // Insert after `afterId` (inheriting its parent), else at the start/end of
    // the requested `parentId` (top level by default).
    const afterRow = body.afterId
      ? rows.find((r) => r.id === body.afterId)
      : undefined;
    const parentId = afterRow ? afterRow.parentId : body.parentId ?? null;
    const [prev, next] = rankWindow(rows, parentId, body.afterId, EMPTY);
    const rootRanks = Rank.nBetween(prev, next, body.blocks.length);

    const { rootIds } = await db.transaction((tx) =>
      insertForest(tx, {
        documentId: params.documentId,
        parentId,
        rootRanks,
        forest: body.blocks,
      }),
    );

    blocksLiveResource.notify({ documentId: params.documentId });
    await blocksChanged.emit({ documentId: params.documentId });
    return { rootIds };
  },
);
