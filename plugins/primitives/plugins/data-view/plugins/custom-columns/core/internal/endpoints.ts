import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

export const SetCustomColumnValueBodySchema = z.object({
  dataViewId: z.string(),
  rowKey: z.string(),
  columnId: z.string(),
  /** Empty string deletes the cell, so clearing leaves no orphan empty row. */
  value: z.string(),
});
export type SetCustomColumnValueBody = z.infer<
  typeof SetCustomColumnValueBodySchema
>;

/** Upsert (or delete-on-empty) a single custom-column cell value. */
export const setCustomColumnValue = defineEndpoint({
  route: "POST /api/data-view/custom-values",
  body: SetCustomColumnValueBodySchema,
});
