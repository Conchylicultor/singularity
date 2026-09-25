import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { Resource } from "@plugins/framework/plugins/server-core/core";
import { conversationsRevisionResource } from "./internal/revision-resource";

export { handleQuery } from "./internal/handle-query";
export { conversationsRevisionResource } from "./internal/revision-resource";

export default {
  description:
    "Global conversations query handler (filter/sort/search/keyset over conversations_v) + the scalar revision-tick live resource that keeps the All-conversations DataView window fresh.",
  contributions: [Resource.Declare(conversationsRevisionResource)],
} satisfies ServerPluginDefinition;
