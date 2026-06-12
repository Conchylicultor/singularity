import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ActionBar } from "@plugins/shell/plugins/action-bar/web";
import { FullscreenToggle } from "./components/fullscreen-toggle";

export default {
  description: "Toolbar toggle to enter / exit browser fullscreen.",
  contributions: [
    ActionBar.Item({ id: "fullscreen-toggle", component: FullscreenToggle }),
  ],
} satisfies PluginDefinition;
