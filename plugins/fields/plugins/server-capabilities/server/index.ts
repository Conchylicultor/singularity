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
export { resolveFieldValueTextCast } from "./internal/value-cast";
export type {
  ValueTextCast,
  FieldValueTextCastContribution,
} from "./internal/value-cast";
export { fieldsToColumns } from "./internal/fields-to-columns";

export default {
  description:
    "Server-owned field-capability library: the Fields.Storage / Fields.FilterSql / Fields.ValueTextCast tokens, their resolvers (resolveFieldStorage / resolveFieldFilterSql / resolveFieldValueTextCast), and the storage/filter-sql eager self-registering indexes. A graph sink — never imports a capability barrel.",
} satisfies ServerPluginDefinition;
