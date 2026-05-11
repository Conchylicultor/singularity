import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/shared";

export const ConversationNoteSchema = z.object({
  conversationId: z.string(),
  notes: z.string(),
  updatedAt: z.coerce.date(),
});
export type ConversationNote = z.infer<typeof ConversationNoteSchema>;

export const ConversationNotesPayloadSchema = z.record(
  z.string(),
  ConversationNoteSchema,
);
export type ConversationNotesPayload = z.infer<
  typeof ConversationNotesPayloadSchema
>;

export const conversationNotesResource =
  resourceDescriptor<ConversationNotesPayload>(
    "conversation-notes",
    ConversationNotesPayloadSchema,
    {},
  );
