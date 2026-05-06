import type { ServerPluginDefinition } from "@server/types";
import { conversationNotesResource } from "./internal/resource";
import { handleUpsertNote, handleDeleteNote } from "./internal/routes";

export { conversationNotes } from "./internal/tables";
export { conversationNotesResource } from "./internal/resource";

export default {
  id: "conversation-notes",
  name: "Conversation: Notes",
  description:
    "Per-conversation free-form notes, auto-saved to the server.",
  resources: [conversationNotesResource],
  httpRoutes: {
    "PUT /api/conversation-notes/:conversationId": handleUpsertNote,
    "DELETE /api/conversation-notes/:conversationId": handleDeleteNote,
  },
} satisfies ServerPluginDefinition;
