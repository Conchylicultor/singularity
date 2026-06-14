import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { QueuedPromptCard } from "./components/queued-prompt-card";

export default {
  collapsed: true,
  description:
    "Shared appearance for a queued prompt (a message the user parked while the agent was busy). Used by both the queued_command attachment and the prompt-queue enqueue row so the two never diverge.",
  contributions: [],
} satisfies PluginDefinition;
