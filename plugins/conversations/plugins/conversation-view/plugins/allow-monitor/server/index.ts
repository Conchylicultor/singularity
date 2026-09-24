import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { allowFilesLiveResource } from "./internal/allow-files-resource";

export default {
  contributions: [Resource.Declare(allowFilesLiveResource)],
} satisfies ServerPluginDefinition;
