import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { handlePluginChanges } from "./internal/handle-plugin-changes";
import { pluginChangesResource } from "./internal/plugin-changes-resource";
import { getPluginChanges } from "../core/endpoints";

export default {
  description:
    "Computes structured diffs of plugin public APIs between the worktree and main.",
  contributions: [Resource.Declare(pluginChangesResource)],
  httpRoutes: {
    [getPluginChanges.route]: handlePluginChanges,
  },
} satisfies ServerPluginDefinition;
