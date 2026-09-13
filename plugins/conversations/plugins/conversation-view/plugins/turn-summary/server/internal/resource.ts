import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import {
  turnSummariesResource as turnSummariesDescriptor,
  type TurnSummariesPayload,
} from "../../shared";
import { turnSummaries } from "./tables";

// Every row folded into a `{ conversationId → row }` record. Each row is the
// extension's `wireColumns` — the same projection its `schema` describes — so a
// column added to the shape reaches the wire with no loader change.
export const turnSummariesResource = defineResource(turnSummariesDescriptor, {
  mode: "push",
  loader: async () => {
    const rows = await db
      .select(turnSummaries.wireColumns)
      .from(turnSummaries.table);
    const out: TurnSummariesPayload = {};
    for (const r of rows) out[r.conversationId] = r;
    return out;
  },
});
