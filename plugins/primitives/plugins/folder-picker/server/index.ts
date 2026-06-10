import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { browseHostDir } from "../core";
import { browse } from "./internal/browse";

export default {
  description:
    "Host filesystem directory-browsing endpoint backing the folder-picker UI: lists a directory's subdirectories and validates a typed path.",
  httpRoutes: {
    [browseHostDir.route]: browse,
  },
} satisfies ServerPluginDefinition;
