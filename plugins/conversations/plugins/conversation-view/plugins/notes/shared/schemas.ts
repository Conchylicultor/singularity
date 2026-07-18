import { z } from "zod";
import { pointQueryResourceDescriptor } from "@plugins/infra/plugins/query-resource/core";

export const ConversationNoteSchema = z.object({
  conversationId: z.string(),
  notes: z.string(),
  updatedAt: z.coerce.date(),
});
export type ConversationNote = z.infer<typeof ConversationNoteSchema>;

// Bounded POINT resource: a consumer subscribes by an explicit conversation-id
// (`usePointResource(resource, convId)` → one row-or-null), so a note read costs
// O(1) instead of an O(n) lookup over the whole collection. Rows key on
// `conversationId` — the ALIAS the server projection exposes the side-table's
// `parent_id` PK under (which IS the point identity). NOT bootCritical: point
// resources hydrate post-mount (the recorded decision); the notes editor keeps
// serverNote="" during that one round-trip (the pending arm) so useEditableField
// always has a valid initial value.
export const conversationNotesResource =
  pointQueryResourceDescriptor<ConversationNote>(
    "conversation-notes",
    ConversationNoteSchema,
    "conversationId",
  );
