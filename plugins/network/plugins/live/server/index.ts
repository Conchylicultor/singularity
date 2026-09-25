import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

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
    "Unified live-resource API, server half: serveCollection (binds a liveCollection's row fields to a table's columns — the projection is exactly the row schema — ANDs an optional base `where` into every read, and compiles its window + `:rows` point resources through windowQueryResource and its `:groups` GROUP BY push value); every filter compiles through the filter language's filterSql.",
} satisfies ServerPluginDefinition;
