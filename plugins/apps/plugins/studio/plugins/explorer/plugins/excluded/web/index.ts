import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Explorer } from "@plugins/apps/plugins/studio/plugins/explorer/web";
import { ExcludedBadge } from "./components/excluded-badge";

export default {
  description: "Not-in-the-app badge in the explorer plugin tree row.",
  contributions: [
    Explorer.TreeRowBadge({ id: "excluded", component: ExcludedBadge }),
  ],
} satisfies PluginDefinition;
