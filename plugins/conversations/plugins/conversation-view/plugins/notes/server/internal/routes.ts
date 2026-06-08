import { implement } from "@plugins/infra/plugins/endpoints/server";
import { upsertNote, deleteNote } from "../../shared/endpoints";
import { conversationNotes } from "./tables";
import { conversationNotesResource } from "./resource";

export const handleUpsertNote = implement(upsertNote, async ({ params, body }) => {
  await conversationNotes.upsert(params.conversationId, { notes: body.notes });
  conversationNotesResource.notify();
});

export const handleDeleteNote = implement(deleteNote, async ({ params }) => {
  await conversationNotes.delete(params.conversationId);
  conversationNotesResource.notify();
});
