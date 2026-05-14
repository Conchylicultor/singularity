import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Shell } from "@plugins/shell/web";
import { ImproveButton } from "./components/improve-button";

export { Improve as ImproveCommands } from "./commands";
export type { OpenWithTextArgs } from "./commands";

export default {
  id: "improve",
  name: "Improve",
  description:
    'Toolbar button for app-improvement feedback. Files a task under "Improvements" with URL + optional screenshot.',
  contributions: [
    Shell.Toolbar({
      id: "improve",
      component: ImproveButton,
      group: "actions",
    }),
  ],
} satisfies PluginDefinition;
