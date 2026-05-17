import type { ServerPluginDefinition } from "@server/types";
import { Resource } from "@server/resources";
import { editedFilesResource } from "./internal/edited-files-resource";

export { getEditedFiles } from "./internal/get-edited-files";

export default {
  id: "conversation-code",
  name: "Conversation: Code",
  description:
    "Tracks edited files in the conversation's worktree via the live-state primitive.",
  contributions: [Resource.Declare(editedFilesResource)],
} satisfies ServerPluginDefinition;
