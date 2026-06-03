import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ActionBar } from "@plugins/shell/plugins/action-bar/web";
import { ImproveButton } from "./components/improve-button";

export { Improve as ImproveCommands } from "./commands";
export type { OpenWithTextArgs } from "./commands";

export default {
  id: "improve",
  name: "Improve",
  description:
    'Toolbar button for app-improvement feedback. Files a task under "Improvements" with URL + optional screenshot.',
  contributions: [
    ActionBar.Item({
      id: "improve",
      component: ImproveButton,
    }),
  ],
} satisfies PluginDefinition;
