import type { ServerPluginDefinition } from "@server/types";
import { Resource } from "@server/resources";
import { conversationNotesResource } from "./internal/resource";
import { handleUpsertNote, handleDeleteNote } from "./internal/routes";
import { upsertNote, deleteNote } from "../shared/endpoints";

export { conversationNotes } from "./internal/tables";
export { conversationNotesResource } from "./internal/resource";

export default {
  id: "conversation-notes",
  name: "Conversation: Notes",
  description:
    "Per-conversation free-form notes, auto-saved to the server.",
  contributions: [Resource.Declare(conversationNotesResource)],
  httpRoutes: {
    [upsertNote.route]: handleUpsertNote,
    [deleteNote.route]: handleDeleteNote,
  },
} satisfies ServerPluginDefinition;
