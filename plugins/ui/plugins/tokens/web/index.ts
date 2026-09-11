import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export default {
  collapsed: true,
  description:
    "Umbrella for CSS token group plugins: each declares its variables and schema defaults, and a customizer section that edits the scope's theme.",
  contributions: [],
} satisfies PluginDefinition;
