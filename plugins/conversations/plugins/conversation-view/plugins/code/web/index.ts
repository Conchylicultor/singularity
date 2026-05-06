import type { PluginDefinition } from "@core";

export { useEditedFiles } from "./use-edited-files";

export default {
  id: "conversation-code",
  name: "Conversation: Code",
  description:
    "Meta plugin hosting code-related contributions for a conversation (edited files, viewer, etc.).",
} satisfies PluginDefinition;
