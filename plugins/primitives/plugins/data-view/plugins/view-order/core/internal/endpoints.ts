import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

export const SetRowOrderBodySchema = z.object({
  dataViewId: z.string(),
  viewId: z.string(),
  /**
   * The view instance's COMPLETE ordered key set, post-move, in display order.
   * Every write is a full replace: the server drops every `(dataViewId, viewId)`
   * row whose `rowKey` is absent here and regenerates dense ranks for the rest.
   * `[]` degenerates to the delete alone. Duplicates are rejected (400).
   */
  order: z.array(z.string()),
});
export type SetRowOrderBody = z.infer<typeof SetRowOrderBodySchema>;

/** Replace a view instance's entire manual row order. */
export const setRowOrder = defineEndpoint({
  route: "POST /api/data-view/row-order",
  body: SetRowOrderBodySchema,
});
