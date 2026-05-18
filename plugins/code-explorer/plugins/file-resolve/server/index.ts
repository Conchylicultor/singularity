import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { handleResolve } from "./internal/resolve-handler";
import { resolveFile } from "../shared/endpoints";

export default {
  id: "code-explorer-file-resolve",
  name: "Code Explorer: File Resolve",
  description:
    "Fuzzy file path resolution via segment-subsequence matching against git ls-files.",
  httpRoutes: {
    [resolveFile.route]: handleResolve,
  },
} satisfies ServerPluginDefinition;
