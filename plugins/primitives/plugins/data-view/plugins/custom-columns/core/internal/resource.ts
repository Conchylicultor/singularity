import { z } from "zod";
import { liveValue } from "@plugins/network/plugins/live/core";
import { CustomColumnDefSchema, CustomColumnValueRowSchema } from "./types";

/**
 * Live per-surface custom-column values, one payload per `{ dataViewId }`: every
 * cell of that surface's custom columns, indexed client-side onto each rendered
 * row. A value, not a collection: the table's key is the composite
 * `(dataViewId, rowKey, columnId)`, so there is no single id a `:rows` read
 * could key on (the server states the bound — `unbounded: { reason }`). Its
 * loader reads `data_view_custom_values`, so the change feed recomputes it on
 * every write — no notify. No placeholder: before the first value lands the
 * read is `pending`.
 */
export const customColumnValues = liveValue("data-view-custom-values", {
  schema: z.array(CustomColumnValueRowSchema),
  params: ["dataViewId"],
});

/**
 * One DataView surface's custom column DEFINITIONS, as the server reads them
 * from the surface's config — the members of the `custom` scoped column set
 * (see `CUSTOM_COLUMNS_SET`). Served from the config (external: its truth is a
 * file, not a table) and notified when a surface's definitions change, which
 * is what a live collection listed on that surface recomputes on: a column
 * added, dropped or retyped moves the SQL its tuples compiled to.
 */
export const customColumnDefs = liveValue("data-view-custom-column-defs", {
  schema: z.array(CustomColumnDefSchema),
  params: ["dataViewId"],
});

/**
 * The name of the scoped column set custom columns are served as on a live
 * collection (`LiveColumns.Scoped` / `scopedLiveColumns`): a custom column's
 * wire name is `custom.<column id>`.
 */
export const CUSTOM_COLUMNS_SET = "custom";
