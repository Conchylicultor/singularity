import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Publish } from "@plugins/apps/plugins/forge/plugins/publish/web";
import { LoadBearingBadge } from "./components/load-bearing-badge";

export default {
  id: "publish-load-bearing",
  name: "Publish: Load-bearing",
  description: "Load-bearing badge in the publish plugin tree row.",
  contributions: [
    Publish.TreeRowBadge({ id: "load-bearing", component: LoadBearingBadge }),
  ],
} satisfies PluginDefinition;
