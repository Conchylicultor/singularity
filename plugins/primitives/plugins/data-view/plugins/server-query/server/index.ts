import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

export type {
  ColumnBinding,
  FieldColumnMap,
  OperatorSqlBuilder,
  OperatorSqlResolver,
} from "./internal/compile";
export { compileWhere } from "./internal/compile";

export type {
  QueryAugmentorContext,
  DataViewJoin,
  ServerQueryAugmentation,
  QueryAugmentor,
} from "./internal/augment";
export { DataViewServer, augmentServerQuery } from "./internal/augment";

export default {
  description:
    "Generic FilterGroup → SQL compiler for server-delegated data-view sources, plus the DataViewServer.QueryAugmentor registry (server twin of the web FieldExtension slot) that lets sub-plugins inject extra joined sort/filter columns. Field-type agnostic: operator SQL is supplied by an injected resolver, so this owns drizzle and the filter compilation, not any field type. The field-agnostic keyset seek + cursor codec now live in primitives/keyset.",
  // Owns the QueryAugmentor registry token but registers no contribution itself.
  contributions: [],
} satisfies ServerPluginDefinition;
