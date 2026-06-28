import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { Fields } from "@plugins/fields/server";
import { dateFieldType } from "@plugins/fields/plugins/date/core";
import { dateFilterSql } from "./internal/date-filter-sql";

export default {
  description:
    "Date field type: server filter-sql capability — day-granular operator→SQL fragments mirroring the data-view date filter predicates.",
  contributions: [
    Fields.FilterSql({ type: dateFieldType, operators: dateFilterSql }),
  ],
} satisfies ServerPluginDefinition;
