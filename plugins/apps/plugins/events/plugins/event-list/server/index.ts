import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
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
