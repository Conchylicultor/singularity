import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Publish } from "@plugins/apps/plugins/forge/plugins/publish/web";
import { CollapsedBadge } from "./components/collapsed-badge";

export default {
  id: "publish-collapsed",
  name: "Publish: Collapsed",
  description: "Collapsed badge in the publish plugin tree row.",
  contributions: [
    Publish.TreeRowBadge({ id: "collapsed", component: CollapsedBadge }),
  ],
} satisfies PluginDefinition;
