import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { Fields } from "@plugins/fields/server";
import { boolFieldType } from "@plugins/fields/plugins/bool/core";
import { boolFilterSql } from "./internal/bool-filter-sql";

export default {
  description:
    "Boolean field type: server filter-sql capability — operator→SQL fragments mirroring the data-view bool filter predicates.",
  contributions: [
    Fields.FilterSql({ type: boolFieldType, operators: boolFilterSql }),
  ],
} satisfies ServerPluginDefinition;
