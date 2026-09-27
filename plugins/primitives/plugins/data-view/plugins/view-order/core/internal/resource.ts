import { z } from "zod";
import { liveValue } from "@plugins/network/plugins/live/core";
import { RowOrderRowSchema } from "./types";

/**
 * Live per-view-instance row order, one payload per `{ dataViewId, viewId }`:
 * the rows a user dragged plus the seeds written ahead of them, **rank-ordered**
 * (`ORDER BY rank ASC`). A value, not a collection: the table's key is the
 * composite `(dataViewId, viewId, rowKey)`, so there is no single id a `:rows`
 * read could key on (the server states the bound — `unbounded: { reason }`).
 * Its loader reads `data_view_row_order`, so the change feed recomputes it on
 * every write — no notify. No placeholder: before the first value lands the
 * read is `pending`.
 */
export const rowOrder = liveValue("data-view-row-order", {
  schema: z.array(RowOrderRowSchema),
  params: ["dataViewId", "viewId"],
});
