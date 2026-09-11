import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Reports } from "@plugins/reports/web";
import { HealthReport } from "@plugins/shell/plugins/health-report/web";
import { DB_ABANDON_CAP_KIND, DB_QUERY_DEADLINE_KIND } from "../core";
import { QueryDeadlineSummary } from "./components/query-deadline-summary";
import { AbandonCapSummary } from "./components/abandon-cap-summary";
import { useDatabaseHealth } from "./internal/use-database-health";

export default {
  description:
    "Query-deadline presence: the health report's Database row (attention while a database query was lost in the last 10 minutes, read from the db-query-deadlines push resource) and the one-line Debug → Reports summaries for the db-query-deadline and db-abandon-cap kinds.",
  contributions: [
    Reports.KindView({
      match: DB_QUERY_DEADLINE_KIND,
      component: QueryDeadlineSummary,
    }),
    Reports.KindView({
      match: DB_ABANDON_CAP_KIND,
      component: AbandonCapSummary,
    }),
    HealthReport.Row({
      kind: "status",
      id: "database",
      title: "Database",
      // Right after Connection (10): the two rows answer "can I reach the
      // server" and then "is the server reaching its database".
      order: 20,
      useStatus: useDatabaseHealth,
    }),
  ],
} satisfies PluginDefinition;
