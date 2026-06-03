import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Publish } from "@plugins/apps/plugins/forge/plugins/publish/web";
import { ChildCountBadge } from "./components/child-count-badge";

export default {
  name: "Publish: Child count",
  description: "Recursive child count badge in the publish plugin tree row.",
  contributions: [
    Publish.TreeRowBadge({ id: "child-count", component: ChildCountBadge }),
  ],
} satisfies PluginDefinition;
