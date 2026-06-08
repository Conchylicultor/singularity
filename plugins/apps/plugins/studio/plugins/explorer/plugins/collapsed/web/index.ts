import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Explorer } from "@plugins/apps/plugins/studio/plugins/explorer/web";
import { CollapsedBadge } from "./components/collapsed-badge";

export default {
  name: "Explorer: Collapsed",
  description: "Collapsed badge in the explorer plugin tree row.",
  contributions: [
    Explorer.TreeRowBadge({ id: "collapsed", component: CollapsedBadge }),
  ],
} satisfies PluginDefinition;
