import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Explorer } from "@plugins/apps/plugins/studio/plugins/explorer/web";
import { DisabledBadge } from "./components/disabled-badge";

export default {
  description: "Disabled badge in the explorer plugin tree row.",
  contributions: [
    Explorer.TreeRowBadge({ id: "disabled", component: DisabledBadge }),
  ],
} satisfies PluginDefinition;
