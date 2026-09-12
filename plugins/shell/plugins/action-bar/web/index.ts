import { ActionBar } from "./slots";
import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { ActionBar } from "./slots";

export default {
  description:
    "Shared cross-app action set. Defines the ActionBar.Item slot that plugins contribute their toolbar actions to, and the ActionBar.ViewOption slot for view options (surface mode, fullscreen, layout editing) folded behind the bar's gear popover; the global-action-bar plugin renders both.",
  contributions: [],
  slots: ActionBar,
} satisfies PluginDefinition;
