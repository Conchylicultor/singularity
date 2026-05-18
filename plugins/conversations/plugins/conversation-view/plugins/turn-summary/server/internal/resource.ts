import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import {
  TurnSummariesPayloadSchema,
  type TurnSummariesPayload,
} from "../../shared";
import { turnSummaries } from "./tables";

export const turnSummariesResource = defineResource<TurnSummariesPayload>({
  key: "turn-summaries",
  mode: "push",
  schema: TurnSummariesPayloadSchema,
  loader: async () => {
    const rows = await db
      .select({
        conversationId: turnSummaries.table.parentId,
        messageId: turnSummaries.table.messageId,
        summary: turnSummaries.table.summary,
        caveats: turnSummaries.table.caveats,
        actions: turnSummaries.table.actions,
        generatedAt: turnSummaries.table.generatedAt,
      })
      .from(turnSummaries.table);
    const out: TurnSummariesPayload = {};
    for (const r of rows) out[r.conversationId] = r;
    return out;
  },
});
