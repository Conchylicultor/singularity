import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { Fields } from "@plugins/fields/plugins/server-capabilities/server";
import { textFieldType } from "@plugins/fields/plugins/text/core";
import { textFilterSql } from "./internal/text-filter-sql";

export default {
  description:
    "Text field type: server filter-sql capability — operator→SQL fragments mirroring the data-view text filter predicates.",
  contributions: [
    Fields.FilterSql({ type: textFieldType, operators: textFilterSql }),
  ],
} satisfies ServerPluginDefinition;
