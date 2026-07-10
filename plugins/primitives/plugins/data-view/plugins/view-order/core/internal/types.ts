import { z } from "zod";
import { Rank, RankSchema } from "@plugins/primitives/plugins/rank/core";

/**
 * One persisted row-order entry for a `(dataViewId, viewId)` view instance. The
 * full key is `(dataViewId, viewId, rowKey)`; the resource is already scoped to
 * one `(dataViewId, viewId)` pair, so the live payload carries only the
 * remaining coordinate plus its rank.
 *
 * `rowKey` is the consumer's opaque `rowKey(row, 0)` string — the primitive
 * never interprets it, and cannot resolve it back to a live row (see the
 * retention note in this plugin's CLAUDE.md).
 */
export interface RowOrderRow {
  rowKey: string;
  rank: Rank;
}

export const RowOrderRowSchema = z.object({
  rowKey: z.string(),
  rank: RankSchema,
});
