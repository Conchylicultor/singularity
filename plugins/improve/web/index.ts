import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ActionBar } from "@plugins/shell/plugins/action-bar/web";
import { ImproveButton } from "./components/improve-button";

export { openImproveWithText } from "./internal/open-store";

export default {
  description:
    'Toolbar button for app-improvement feedback. Files a task under "Improvements" with URL + optional screenshot.',
  contributions: [
    ActionBar.Item({
      id: "improve",
      component: ImproveButton,
    }),
  ],
} satisfies PluginDefinition;
