import type { PluginDefinition } from "@core";

export default {
  id: "conversations-model-provider",
  name: "Model Provider",
  description: "Registry mapping logical ConversationModel IDs to pinned Claude CLI flags and display metadata.",
  contributions: [],
} satisfies PluginDefinition;
