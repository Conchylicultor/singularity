import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Explorer } from "@plugins/apps/plugins/studio/plugins/explorer/web";
import { LoadBearingBadge } from "./components/load-bearing-badge";

export default {
  name: "Explorer: Load-bearing",
  description: "Load-bearing badge in the explorer plugin tree row.",
  contributions: [
    Explorer.TreeRowBadge({ id: "load-bearing", component: LoadBearingBadge }),
  ],
} satisfies PluginDefinition;
