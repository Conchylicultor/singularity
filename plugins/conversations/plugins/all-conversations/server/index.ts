import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { Resource } from "@plugins/framework/plugins/server-core/core";
// Force the fields filter-sql capability barrels to evaluate (self-registering
// their operator maps into the `server-capabilities` eager index) so
// `resolveFieldFilterSql` in handle-query resolves, and so the composition closure
// includes those barrels in any release bundle shipping all-conversations.
import "@plugins/fields/plugins/server-capabilities-loader/server";
import { conversationsRevisionResource } from "./internal/revision-resource";

export { handleQuery } from "./internal/handle-query";
export { conversationsRevisionResource } from "./internal/revision-resource";

export default {
  description:
    "Global conversations query handler (filter/sort/search/keyset over conversations_v) + the scalar revision-tick live resource that keeps the All-conversations DataView window fresh.",
  contributions: [Resource.Declare(conversationsRevisionResource)],
} satisfies ServerPluginDefinition;
