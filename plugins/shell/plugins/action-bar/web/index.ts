import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Shell } from "@plugins/shell/web";
import { ActionBarStrip } from "./components/action-bar-strip";

export { ActionBar } from "./slots";

export default {
  description:
    "Shared cross-app action set. Defines the ActionBar.Item slot; the agent-manager toolbar and the floating bar both render it.",
  contributions: [
    Shell.Toolbar({
      id: "action-bar",
      component: ActionBarStrip,
      group: "actions",
      excludeFromReorder: true,
    }),
  ],
} satisfies PluginDefinition;
