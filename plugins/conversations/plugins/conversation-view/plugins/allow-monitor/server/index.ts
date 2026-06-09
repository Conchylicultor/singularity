import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { getAllowFiles } from "../shared/endpoints";
import { handleGetAllowFiles } from "./internal/allow-files-handler";

export default {
  httpRoutes: {
    [getAllowFiles.route]: handleGetAllowFiles,
  },
} satisfies ServerPluginDefinition;
