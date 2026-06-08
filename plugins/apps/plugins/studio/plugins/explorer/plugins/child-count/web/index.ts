import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Explorer } from "@plugins/apps/plugins/studio/plugins/explorer/web";
import { ChildCountBadge } from "./components/child-count-badge";

export default {
  name: "Explorer: Child count",
  description: "Recursive child count badge in the explorer plugin tree row.",
  contributions: [
    Explorer.TreeRowBadge({ id: "child-count", component: ChildCountBadge }),
  ],
} satisfies PluginDefinition;
