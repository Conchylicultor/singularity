import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

export type { ColumnBinding, FieldColumnMap } from "./internal/compile";
export {
  bindColumns,
  compileWhere,
  decodeFilterBody,
  filterableOf,
} from "./internal/compile";

export type {
  AugmentedColumn,
  QueryAugmentorContext,
  DataViewJoin,
  ServerQueryAugmentation,
  QueryAugmentor,
} from "./internal/augment";
export { DataViewServer, augmentServerQuery } from "./internal/augment";

export default {
  description:
    "Server half of a server-delegated DataView over the one filter language: bindColumns binds a source's core `filterable` declaration to its SQL (domain copied, every column bound), decodeFilterBody strictly decodes the wire filter (400 on anything undeclared), compileWhere compiles it through the language's filterSql, and the DataViewServer.QueryAugmentor registry (server twin of the web FieldExtension slot) lets sub-plugins offer extra joined sort/filter columns. Names no field type; the keyset seek + cursor codec live in primitives/keyset.",
  // Owns the QueryAugmentor registry token but registers no contribution itself.
  contributions: [],
} satisfies ServerPluginDefinition;
