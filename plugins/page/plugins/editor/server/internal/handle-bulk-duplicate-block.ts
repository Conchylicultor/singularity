import { Rank } from "@plugins/primitives/plugins/rank/core";
import { selectionRoots } from "@plugins/primitives/plugins/tree/core";
import { db } from "@plugins/database/server";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import { bulkDuplicateBlocks } from "../../core/endpoints";
import { _blocks } from "./tables";
import { blocksLiveResource } from "./resources";
import { blocksChanged } from "./tables-events";
import { insertForest, loadDocBlocks, rankWindow, serializeSubtree } from "./forest";

const EMPTY = new Set<string>();

export const handleBulkDuplicateBlock = implement(
  bulkDuplicateBlocks,
  async ({ params, body }) => {
    if (body.ids.length === 0) return { rootIds: [] };

    const rows = await loadDocBlocks(params.documentId);
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
        const { rootIds: created } = await insertForest(tx, {
          documentId: params.documentId,
          parentId: root.parentId,
          rootRanks: Rank.nBetween(prev, next, 1),
          forest: [serializeSubtree(rows, rootId)],
        });
        rootIds.push(...created);
      }
    });

    blocksLiveResource.notify({ documentId: params.documentId });
    await blocksChanged.emit({ documentId: params.documentId });
    return { rootIds };
  },
);
