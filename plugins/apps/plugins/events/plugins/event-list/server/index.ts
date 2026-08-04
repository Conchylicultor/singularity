import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
// Force the fields filter-sql capability barrels to evaluate (self-registering
// their operator maps into the `server-capabilities` eager index) so
// `resolveFieldFilterSql` in handle-query resolves, and so the composition
// closure includes those barrels in any release bundle shipping event-list.
import "@plugins/fields/plugins/server-capabilities-loader/server";
import { queryEvents } from "../core";
import { handleQuery } from "./internal/handle-query";

export { handleQuery } from "./internal/handle-query";

export default {
  description:
    "Events DataView server: the keyset events query (POST /api/events/query) over the events table — filter/sort/search compiled to SQL, cursor-paginated, with soft-deleted events hidden by default.",
  httpRoutes: {
    [queryEvents.route]: handleQuery,
  },
} satisfies ServerPluginDefinition;
