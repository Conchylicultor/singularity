import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import { textField } from "@plugins/fields/plugins/text/plugins/config/core";
import { dateField } from "@plugins/fields/plugins/date/plugins/config/core";
import { defineExtensionShape } from "@plugins/infra/plugins/entity-extensions/core";

// The `conversations_ext_turn_summary` row, declared once:
// `server/internal/tables.ts` builds the side-table from this shape (and gives
// `caveats` / `actions` / `generatedAt` their DB defaults), and the wire row is
// its `schema`. Neither timestamp is on the wire — `generatedAt` is the one the
// card shows.
export const turnSummaryShape = defineExtensionShape({
  key: "conversationId",
  fields: {
    messageId: textField(),
    summary: textField(),
    caveats: textField(),
    actions: textField(),
    generatedAt: dateField(),
  },
});
export const TurnSummarySchema = turnSummaryShape.schema;
export type TurnSummary = z.infer<typeof TurnSummarySchema>;

export const TurnSummariesPayloadSchema = z.record(
  z.string(),
  TurnSummarySchema,
);
export type TurnSummariesPayload = z.infer<typeof TurnSummariesPayloadSchema>;

export const turnSummariesResource = resourceDescriptor<TurnSummariesPayload>(
  "turn-summaries",
  TurnSummariesPayloadSchema,
  {},
  { bootCritical: true },
);
