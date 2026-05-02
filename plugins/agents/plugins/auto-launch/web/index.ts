import type { PluginDefinition } from "@core";

export default {
  id: "agents-auto-launch",
  name: "Agents: Auto-Launch",
  description:
    "Umbrella plugin for agent auto-launch. Sub-plugins contribute row actions and settings.",
  contributions: [],
} satisfies PluginDefinition;
