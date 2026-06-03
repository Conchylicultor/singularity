import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Publish } from "@plugins/apps/plugins/forge/plugins/publish/web";
import { ExpandCollapseButton } from "./components/expand-collapse-button";

export default {
  name: "Publish: Expand/Collapse",
  description:
    "Expand/collapse all descendants button in the publish plugin tree row.",
  contributions: [
    Publish.TreeRowBadge({
      id: "expand-collapse",
      component: ExpandCollapseButton,
    }),
  ],
} satisfies PluginDefinition;
