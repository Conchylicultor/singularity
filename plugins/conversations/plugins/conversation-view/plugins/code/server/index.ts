import type { ServerPluginDefinition } from "@server/types";
import { editedFilesResource } from "./internal/edited-files-resource";

export default {
  id: "conversation-code",
  name: "Conversation: Code",
  description:
    "Tracks edited files in the conversation's worktree via the live-state primitive.",
  resources: [editedFilesResource],
} satisfies ServerPluginDefinition;
