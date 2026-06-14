import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { BootSnapshot } from "@plugins/infra/plugins/boot-snapshot/web";
import { Conversation } from "@plugins/conversations/plugins/conversation-view/web";
import { conversationNotesResource } from "../shared";
import { NotesArea } from "./components/notes-area";
import { NotesToggleButton } from "./components/notes-toggle-button";

export default {
  description:
    "Free-form per-conversation notes, auto-saved to the server. Always visible when notes exist; toggle via the note button.",
  contributions: [
    Conversation.AbovePromptInput({ id: "notes", component: NotesArea }),
    Conversation.PromptBar({
      id: "notes-toggle",
      component: NotesToggleButton,
      section: "Notes",
      sectionOrder: -1,
    }),
    BootSnapshot.Hydrate({ descriptor: conversationNotesResource }),
  ],
} satisfies PluginDefinition;
