import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { ActionBar } from "./slots";

export default {
  description:
    "Shared cross-app action set. Defines the ActionBar.Item slot that plugins contribute their toolbar actions to; the global-action-bar plugin renders it.",
  contributions: [],
} satisfies PluginDefinition;
