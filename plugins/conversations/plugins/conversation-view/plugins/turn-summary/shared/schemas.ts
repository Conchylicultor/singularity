import type { z } from "zod";
import { pointQueryResourceDescriptor } from "@plugins/infra/plugins/query-resource/core";
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

// Bounded POINT resource. The side-table is upserted per conversation — ONE row
// per conversation (its latest turn's summary), not one per turn — so the point
// identity IS the side-table's pk (`conversationId`, stored as `parent_id`): one
// subscribed id names exactly one conversation's summary.
//
// The only reader is the open conversation's card, which asks about that one
// conversation. The change feed routes a write to a tuple iff the changed ids
// intersect its set, so a turn completing in one conversation never re-ships
// every conversation's summary to every tab.
//
// NOT preloaded: point resources hydrate post-mount (the recorded decision of
// the bounded working-set contract); the card renders nothing while pending.
//
// The server half is compiled from the extension handle in
// `server/internal/resource.ts`; the wire shape is `TurnSummary[]`.
export const turnSummariesResource = pointQueryResourceDescriptor<TurnSummary>(
  "turn-summaries",
  TurnSummarySchema,
  "conversationId",
);
