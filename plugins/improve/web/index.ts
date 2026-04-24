import type { PluginDefinition } from "@core";
import { Shell } from "@plugins/shell/web";
import { ImproveButton } from "./components/improve-button";

export default {
  id: "improve",
  name: "Improve",
  description:
    'Toolbar button for app-improvement feedback. Files a task under "Improvements" with URL + optional screenshot.',
  contributions: [
    Shell.Toolbar({
      component: ImproveButton,
      group: "actions",
    }),
  ],
} satisfies PluginDefinition;
