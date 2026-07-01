import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { Fields } from "@plugins/fields/plugins/server-capabilities/server";
import { enumFieldType } from "@plugins/fields/plugins/enum/core";
import { enumFilterSql } from "./internal/enum-filter-sql";

export default {
  description:
    "Enum field type: server filter-sql capability — operator→SQL fragments mirroring the data-view enum filter predicates.",
  contributions: [
    Fields.FilterSql({ type: enumFieldType, operators: enumFilterSql }),
  ],
} satisfies ServerPluginDefinition;
