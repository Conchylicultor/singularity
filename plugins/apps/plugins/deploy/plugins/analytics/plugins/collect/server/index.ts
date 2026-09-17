import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { ExcludeFromChangeFeed } from "@plugins/database/plugins/change-feed/server";
import { analyticsQueryEndpoint, collectEndpoint } from "../core";
import { analyticsRollupJob } from "./internal/rollup";
import { analyticsVisitsRetention } from "./internal/retention";
import { handleAnalyticsQuery, handleCollect } from "./internal/routes";
import { analyticsHits, analyticsVisits } from "./internal/tables";

export default {
  description:
    "Owns the analytics tables (daily salts, 90-day visits and hits, forever daily totals at every single-filter level), the public collect endpoint, the host-only report query, the nightly analytics.rollup job and the visits retention sweep that refuses to delete a day not yet rolled up.",
  httpRoutes: {
    [collectEndpoint.route]: handleCollect,
    [analyticsQueryEndpoint.route]: handleAnalyticsQuery,
  },
  contributions: [
    // Every public page load writes here; nothing renders these rows live
    // (the dashboard reads a report over SSH on demand), so a change-feed
    // trigger would be pure notify churn driven by internet traffic.
    ExcludeFromChangeFeed({
      table: analyticsVisits,
      reason:
        "Written on every public pageview; no live-state resource reads it — reports are computed on demand over SSH.",
    }),
    ExcludeFromChangeFeed({
      table: analyticsHits,
      reason:
        "Written on every public pageview and event; no live-state resource reads it — reports are computed on demand over SSH.",
    }),
  ],
  register: [analyticsRollupJob, analyticsVisitsRetention],
} satisfies ServerPluginDefinition;
