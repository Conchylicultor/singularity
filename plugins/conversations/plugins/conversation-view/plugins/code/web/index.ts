import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { useEditedFiles } from "./use-edited-files";
export { gitStatusDot, gitStatusBadge } from "./internal/git-status-colors";

export default {
  id: "conversation-code",
  name: "Conversation: Code",
  description:
    "Meta plugin hosting code-related contributions for a conversation (edited files, viewer, etc.).",
} satisfies PluginDefinition;
