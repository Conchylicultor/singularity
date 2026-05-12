import { asc, eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { defineResource } from "@server/resources";
import {
  ActiveDataBindingsPayloadSchema,
  type ActiveDataBindingsPayload,
} from "../../core/resource";
import { _activeDataBindings } from "./tables";

export const activeDataBindingsResource = defineResource<
  ActiveDataBindingsPayload,
  { conversationId: string }
>({
  key: "active-data.bindings",
  mode: "push",
  schema: ActiveDataBindingsPayloadSchema,
  loader: async ({ conversationId }) =>
    db
      .select({
        messageId: _activeDataBindings.messageId,
        tag: _activeDataBindings.tag,
        occurrenceIndex: _activeDataBindings.occurrenceIndex,
        payload: _activeDataBindings.payload,
      })
      .from(_activeDataBindings)
      .where(eq(_activeDataBindings.conversationId, conversationId))
      .orderBy(
        asc(_activeDataBindings.messageId),
        asc(_activeDataBindings.tag),
        asc(_activeDataBindings.occurrenceIndex),
      ),
});
