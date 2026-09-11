import {
  Resource,
  type ServerPluginDefinition,
} from "@plugins/framework/plugins/server-core/core";
import { abandonCapKind, queryDeadlineKind } from "./internal/kinds";
import { dbQueryDeadlinesServerResource } from "./internal/resource";
import {
  registerQueryDeadlineReports,
  unregisterQueryDeadlineReports,
} from "./internal/register";

export { abandonCapKind, queryDeadlineKind } from "./internal/kinds";

export default {
  description:
    "Query-deadline audit: registers a handler on the database plugin's query-deadline seam and turns each announcement into a report — db-query-deadline (error, one row per query label) when a query got no answer before its deadline and its connection was abandoned, db-abandon-cap (error, one rolling row) when the abandoned connections exceed the cap — and keeps the last 20 hits in memory as the db-query-deadlines push resource behind the health report's Database row.",
  contributions: [
    queryDeadlineKind,
    abandonCapKind,
    Resource.Declare(dbQueryDeadlinesServerResource),
  ],
  onReady: () => {
    registerQueryDeadlineReports();
  },
  onShutdown: () => {
    unregisterQueryDeadlineReports();
  },
} satisfies ServerPluginDefinition;
