import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

export {
  compileCollection,
  serveCollection,
} from "./internal/serve-collection";
export { serveValue } from "./internal/serve-value";
export { compileValue } from "../shared/compile-value";
export type { ServedExternalValue, ServedValue } from "./internal/serve-value";
export type {
  CompiledValue,
  LiveValueSource,
  ServeValueOptions,
} from "../shared/compile-value";
export type {
  CollectionSource,
  CollectionSpecs,
  LookupCollectionSpecs,
  ServeCollectionOptions,
  ServedCollection,
  ServedLookupCollection,
} from "./internal/serve-collection";

export default {
  description:
    "Unified live-resource API, server half: serveValue (a liveValue's loader, from Postgres — change-feed driven, a collection-shaped payload must declare `unbounded: { reason }` — or from an external source with notify(); pushed by default, `load: \"on-demand\"` to refetch over HTTP instead) and serveCollection (binds a liveCollection's row fields to a table's columns — the projection is exactly the row schema — ANDs an optional base `where` into every read, and compiles its window + `:rows` point resources through windowQueryResource and its `:groups` GROUP BY push value — only `:rows` for a lookup-only collection — encoding a column type's declared wire form in JS per row); every filter compiles through the filter language's filterSql.",
} satisfies ServerPluginDefinition;
