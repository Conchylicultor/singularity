import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { TableDetail } from "@plugins/apps/plugins/studio/plugins/contributions/plugins/tables/web";
import { RowCountSummary } from "./components/row-count-section";

export default {
  description:
    "Live row count section (estimated from pg_stat_user_tables) in the table detail view.",
  contributions: [
    // One number is one line: no `component`, so the card is that single row.
    TableDetail.Section({
      id: "row-count",
      label: "Row Count",
      summary: RowCountSummary,
    }),
  ],
} satisfies PluginDefinition;
