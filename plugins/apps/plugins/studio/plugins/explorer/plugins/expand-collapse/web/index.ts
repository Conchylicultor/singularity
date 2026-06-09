import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Explorer } from "@plugins/apps/plugins/studio/plugins/explorer/web";
import { ExpandCollapseButton } from "./components/expand-collapse-button";

export default {
  description:
    "Expand/collapse all descendants button in the explorer plugin tree row.",
  contributions: [
    Explorer.TreeRowBadge({
      id: "expand-collapse",
      component: ExpandCollapseButton,
    }),
  ],
} satisfies PluginDefinition;
