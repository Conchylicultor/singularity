import type { z } from "zod";
import { pointQueryResourceDescriptor } from "@plugins/infra/plugins/query-resource/core";
import { textField } from "@plugins/fields/plugins/text/plugins/config/core";
import { defineExtensionShape } from "@plugins/infra/plugins/entity-extensions/core";

// The `conversations_ext_notes` row, declared once: `server/internal/tables.ts`
// builds the side-table from this shape, and the wire row is its `schema`.
// `updatedAt` is the one timestamp put on the wire.
export const conversationNotesShape = defineExtensionShape({
  key: "conversationId",
  fields: { notes: textField() },
  wireTimestamps: ["updatedAt"],
});
export const ConversationNoteSchema = conversationNotesShape.schema;
export type ConversationNote = z.infer<typeof ConversationNoteSchema>;

// Bounded POINT resource: a consumer subscribes by an explicit conversation-id
// (`usePointResource(resource, convId)` → one row-or-null), so a note read costs
// O(1) instead of an O(n) lookup over the whole collection. Rows key on
// `conversationId` — the extension's key, whose column is the side-table's
// `parent_id` PK (which IS the point identity). NOT bootCritical: point
// resources hydrate post-mount (the recorded decision); the notes editor keeps
// serverNote="" during that one round-trip (the pending arm) so useEditableField
// always has a valid initial value.
export const conversationNotesResource =
  pointQueryResourceDescriptor<ConversationNote>(
    "conversation-notes",
    ConversationNoteSchema,
    "conversationId",
  );
