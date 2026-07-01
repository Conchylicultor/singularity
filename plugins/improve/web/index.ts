import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ActionBar } from "@plugins/shell/plugins/action-bar/web";
import { ImproveButton } from "./components/improve-button";

export { openImproveWithText } from "./internal/open-store";
export { IMPROVEMENTS_META_TASK_ID } from "../shared/constants";

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
