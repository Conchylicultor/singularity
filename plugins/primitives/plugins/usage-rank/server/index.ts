import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { recordUsageEndpoint } from "../core";
import { handleRecordUsage } from "./internal/routes";
import { usageStatsResource } from "./internal/resource";
import { usageStatsRetention } from "./internal/retention";

export { _usageStats } from "./internal/tables";
export { usageStatsResource } from "./internal/resource";

export default {
  description:
    "Owns the usage_stats table: one frecency rollup per (namespace, key), updated by a single atomic decay-and-increment upsert, served as a bounded point resource and swept by a nightly 1-year retention job.",
  httpRoutes: {
    [recordUsageEndpoint.route]: handleRecordUsage,
  },
  contributions: [Resource.Declare(usageStatsResource)],
  register: [usageStatsRetention],
} satisfies ServerPluginDefinition;
