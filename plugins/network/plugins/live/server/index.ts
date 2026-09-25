import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

export { liveOpSql, liveClauseSql } from "./internal/op-sql";
export {
  compileCollection,
  serveCollection,
} from "./internal/serve-collection";
export type {
  CollectionSource,
  CollectionSpecs,
  ServeCollectionOptions,
  ServedCollection,
} from "./internal/serve-collection";

export default {
  description:
    "Unified live-resource API, server half: serveCollection (binds a liveCollection's filterable/sortable names to a table's columns and compiles its window + `:rows` point resources through windowQueryResource) and the filter op table's SQL side (liveOpSql / liveClauseSql), paired with core's op ids by type.",
} satisfies ServerPluginDefinition;
