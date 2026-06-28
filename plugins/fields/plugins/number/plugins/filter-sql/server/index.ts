import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { Fields } from "@plugins/fields/server";
import { numberFieldType } from "@plugins/fields/plugins/number/core";
import { numberFilterSql } from "./internal/number-filter-sql";

export default {
  description:
    "Number field type: server filter-sql capability — operator→SQL fragments mirroring the data-view number filter predicates.",
  contributions: [
    Fields.FilterSql({ type: numberFieldType, operators: numberFilterSql }),
  ],
} satisfies ServerPluginDefinition;
