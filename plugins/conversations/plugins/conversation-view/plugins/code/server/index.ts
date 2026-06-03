import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { editedFilesResource } from "./internal/edited-files-resource";

export { getEditedFiles } from "./internal/get-edited-files";

export default {
  name: "Conversation: Code",
  description:
    "Tracks edited files in the conversation's worktree via the live-state primitive.",
  contributions: [Resource.Declare(editedFilesResource)],
} satisfies ServerPluginDefinition;
