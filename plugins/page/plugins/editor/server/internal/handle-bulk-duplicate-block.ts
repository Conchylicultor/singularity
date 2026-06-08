import { Rank } from "@plugins/primitives/plugins/rank/core";
import { selectionRoots } from "@plugins/primitives/plugins/tree/core";
import { db } from "@plugins/database/server";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import { bulkDuplicateBlocks } from "../../core/endpoints";
import { _blocks } from "./tables";
import { blocksLiveResource } from "./resources";
import { blocksChanged } from "./tables-events";
import { computePageId } from "./page-id";
import { insertForest, loadPageBlocks, rankWindow, serializeSubtree } from "./forest";

const EMPTY = new Set<string>();

export const handleBulkDuplicateBlock = implement(
  bulkDuplicateBlocks,
  async ({ params, body }) => {
    if (body.ids.length === 0) return { rootIds: [] };

    const rows = await loadPageBlocks(params.pageId);
    const roots = selectionRoots(rows, new Set(body.ids));
    if (roots.length === 0) return { rootIds: [] };

    const rootIds: string[] = [];
    await db.transaction(async (tx) => {
      for (const rootId of roots) {
        const root = rows.find((r) => r.id === rootId);
        if (!root) continue;
        // Clone lands immediately after the original, between it and its next
        // sibling. The window is computed from the original rows (clones aren't
        // in `rows`), so duplicating adjacent siblings never collides.
        const [prev, next] = rankWindow(rows, root.parentId, root.id, EMPTY);
        const pageId = await computePageId(root.parentId, tx);
        const { rootIds: created } = await insertForest(tx, {
          pageId,
          parentId: root.parentId,
          rootRanks: Rank.nBetween(prev, next, 1),
          forest: [serializeSubtree(rows, rootId)],
        });
        rootIds.push(...created);
      }
    });

    blocksLiveResource.notify({ pageId: params.pageId });
    await blocksChanged.emit({ pageId: params.pageId });
    return { rootIds };
  },
);
