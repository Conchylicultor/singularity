import { and, eq } from "drizzle-orm";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { pasteBlocks } from "../../core/endpoints";
import { PAGE_BLOCK_TYPE } from "../../core/schemas";
import { _blocks } from "./tables";
import { blocksLiveResource } from "./resources";
import { blocksChanged } from "./tables-events";
import { computePageId } from "./page-id";
import { insertForest, loadPageBlocks, rankWindow } from "./forest";

const EMPTY = new Set<string>();

export const handlePasteBlock = implement(
  pasteBlocks,
  async ({ params, body }) => {
    if (body.blocks.length === 0) return { rootIds: [] };

    const [page] = await db
      .select({ id: _blocks.id })
      .from(_blocks)
      .where(and(eq(_blocks.id, params.pageId), eq(_blocks.type, PAGE_BLOCK_TYPE)))
      .limit(1);
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
    if (!page) throw new HttpError(404, "Page not found");

    const rows = await loadPageBlocks(params.pageId);
    // Insert after `afterId` (inheriting its parent), else under the requested
    // `parentId`. `null` parentId means the page's content top level — which is
    // physically parented to the page block itself.
    const afterRow = body.afterId
      ? rows.find((r) => r.id === body.afterId)
      : undefined;
    const parentId = afterRow
      ? afterRow.parentId
      : body.parentId ?? params.pageId;
    const [prev, next] = rankWindow(rows, parentId, body.afterId, EMPTY);
    const rootRanks = Rank.nBetween(prev, next, body.blocks.length);
    const pageId = await computePageId(parentId);

    const { rootIds } = await db.transaction((tx) =>
      insertForest(tx, {
        pageId,
        parentId,
        rootRanks,
        forest: body.blocks,
      }),
    );

    blocksLiveResource.notify({ pageId: params.pageId });
    await blocksChanged.emit({ pageId: params.pageId });
    return { rootIds };
  },
);
