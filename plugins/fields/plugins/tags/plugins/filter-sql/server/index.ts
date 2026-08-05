import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { Fields } from "@plugins/fields/plugins/server-capabilities/server";
import { tagsFieldType } from "@plugins/fields/plugins/tags/core";
import { tagsFilterSql } from "./internal/tags-filter-sql";

export default {
  description:
    "Tags field type: server filter-sql capability — operator→SQL fragments mirroring the data-view tags filter predicates.",
  contributions: [
    Fields.FilterSql({ type: tagsFieldType, operators: tagsFilterSql }),
  ],
} satisfies ServerPluginDefinition;
