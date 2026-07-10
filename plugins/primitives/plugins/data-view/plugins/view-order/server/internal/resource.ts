import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import {
  rowOrderResource,
  RowOrderRowSchema,
  type RowOrderRow,
} from "../../core";
import { _dataViewRowOrder } from "./tables";

/**
 * Push-mode param resource over `data_view_row_order`, scoped by
 * `(dataViewId, viewId)`. A clone of `customColumnValuesLiveResource`: the loader
 * reads the table, so the L4 DB change-feed recomputes it on every write
 * (read-set match). No explicit notify, `dependsOn`, or `identityTable`.
 *
 * Rows are emitted rank-ascending — the client's `seedRanks` reads the whole map
 * anyway, but a rank-ordered payload keeps the wire shape self-describing.
 */
export const rowOrderLiveResource = defineResource<
  RowOrderRow[],
  { dataViewId: string; viewId: string }
>({
  key: rowOrderResource.key,
  mode: "push",
  schema: z.array(RowOrderRowSchema),
  loader: async ({ dataViewId, viewId }) => {
    const rows = await db
      .select({
        rowKey: _dataViewRowOrder.rowKey,
        rank: _dataViewRowOrder.rank,
      })
      .from(_dataViewRowOrder)
      .where(
        and(
          eq(_dataViewRowOrder.dataViewId, dataViewId),
          eq(_dataViewRowOrder.viewId, viewId),
        ),
      )
      .orderBy(asc(_dataViewRowOrder.rank));
    // `rank_text` stores the raw key; wrap it in the branded `Rank` the schema
    // (and every consumer) is typed against.
    return rows.map((row) => ({ rowKey: row.rowKey, rank: Rank.from(row.rank) }));
  },
});
