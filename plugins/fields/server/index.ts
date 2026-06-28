import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

export { resolveFieldStorage } from "./internal/storage";
export type {
  StorageColumnBuilder,
  FieldStorageContribution,
} from "./internal/storage";
// `Fields` is composed in filter-sql.ts (Storage + FilterSql) so the barrel
// re-exports a single capability namespace without any merge logic of its own.
export { Fields, resolveFieldFilterSql } from "./internal/filter-sql";
export type {
  FilterSqlBuilder,
  FieldFilterSqlContribution,
} from "./internal/filter-sql";
export { fieldsToColumns } from "./internal/fields-to-columns";

export default {
  description:
    "Storage-dimension registry: owns the fields.storage server slot where each field type contributes its Drizzle column builder, keyed by type token.",
} satisfies ServerPluginDefinition;
