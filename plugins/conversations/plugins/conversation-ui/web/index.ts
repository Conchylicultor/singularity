import type { PluginDefinition } from "@core";

export default {
  id: "conversation-ui",
  name: "Conversation UI",
  description:
    "Umbrella for visual primitives that render a Conversation. Sub-plugins ship the actual components (item rows/chips, future cards/mentions/etc.).",
  contributions: [],
} satisfies PluginDefinition;
