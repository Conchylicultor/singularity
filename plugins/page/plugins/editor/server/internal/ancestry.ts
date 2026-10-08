import { sql } from "drizzle-orm";
import { z } from "zod";
import { executeRows } from "@plugins/database/plugins/sql-rows/core";
import { HttpError } from "@plugins/infra/plugins/endpoints/server";
import type { BlockReadExecutor } from "./page-id";

/**
 * `parentId` and every row above it, walking `parent_id` upward across page
 * boundaries — the cross-page cycle guard's read. A page-scoped forest cannot
 * answer "is this destination inside one of the moving blocks?" once the
 * destination lives in another page: a dragged sub-page's content rows are
 * keyed to that sub-page, so `isDescendant` over the source page's rows never
 * sees them. Depth-capped so a corrupt `parent_id` cycle terminates.
 */
async function ancestorsOf(
  executor: BlockReadExecutor,
  parentId: string,
): Promise<Set<string>> {
  const rows = await executeRows(executor, {
    label: "page_blocks ancestor walk",
    query: sql`
    WITH RECURSIVE up AS (
      SELECT id, parent_id, 0 AS depth FROM page_blocks WHERE id = ${parentId}
      UNION ALL
      SELECT b.id, b.parent_id, up.depth + 1
      FROM page_blocks b JOIN up ON b.id = up.parent_id
      WHERE up.depth < 1000
    )
    SELECT id FROM up
  `,
    row: z.object({ id: z.string() }),
  });
  return new Set(rows.map((r) => r.id));
}

/**
 * Refuse (400) a move that would put a block under itself or its own subtree.
 * A cross-page move must ask the database, not a forest — see
 * {@link ancestorsOf}.
 */
export async function assertNotIntoOwnSubtree(
  executor: BlockReadExecutor,
  movingIds: readonly string[],
  parentId: string | null,
): Promise<void> {
  if (parentId === null) return;
  const above = await ancestorsOf(executor, parentId);
  const hit = movingIds.find((id) => above.has(id));
  if (hit !== undefined) {
    throw new HttpError(
      400,
      `Cannot move block ${hit} under ${parentId}: the destination is inside it`,
    );
  }
}
