import { db } from "@server/db/client";
import { defineResource } from "@server/resources";
import {
  TurnSummariesPayloadSchema,
  type TurnSummariesPayload,
} from "../../shared";
import { _turnSummaries } from "./tables";

export const turnSummariesResource = defineResource<TurnSummariesPayload>({
  key: "turn-summaries",
  mode: "push",
  schema: TurnSummariesPayloadSchema,
  loader: async () => {
    const rows = await db
      .select({
        conversationId: _turnSummaries.conversationId,
        messageId: _turnSummaries.messageId,
        summary: _turnSummaries.summary,
        caveats: _turnSummaries.caveats,
        actions: _turnSummaries.actions,
        generatedAt: _turnSummaries.generatedAt,
      })
      .from(_turnSummaries);
    const out: TurnSummariesPayload = {};
    for (const r of rows) out[r.conversationId] = r;
    return out;
  },
});
