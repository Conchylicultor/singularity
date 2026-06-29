import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import {
  customColumnValuesResource,
  CustomColumnValueRowSchema,
  type CustomColumnValueRow,
} from "../../core";
import { _dataViewCustomValues } from "./tables";

/**
 * Push-mode param resource over `data_view_custom_values`, scoped by
 * `dataViewId`. A clone of `blocksLiveResource`: the loader reads the table, so
 * the L4 DB change-feed recomputes it on every write (read-set match). No
 * explicit notify, `dependsOn`, or `identityTable` is needed.
 */
export const customColumnValuesLiveResource = defineResource<
  CustomColumnValueRow[],
  { dataViewId: string }
>({
  key: customColumnValuesResource.key,
  mode: "push",
  schema: z.array(CustomColumnValueRowSchema),
  loader: async ({ dataViewId }) =>
    db
      .select({
        rowKey: _dataViewCustomValues.rowKey,
        columnId: _dataViewCustomValues.columnId,
        value: _dataViewCustomValues.value,
      })
      .from(_dataViewCustomValues)
      .where(eq(_dataViewCustomValues.dataViewId, dataViewId)),
});
