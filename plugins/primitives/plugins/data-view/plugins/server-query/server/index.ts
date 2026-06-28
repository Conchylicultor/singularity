import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

export type {
  ColumnBinding,
  FieldColumnMap,
  OperatorSqlBuilder,
  OperatorSqlResolver,
  SortKey,
  Tiebreaker,
} from "./internal/compile";
export {
  compileWhere,
  buildSortKeys,
  orderByClauses,
  seekPredicate,
  keyValuesOf,
} from "./internal/compile";

export default {
  description:
    "Generic FilterGroup/SortRule → SQL compiler + null-aware keyset (cursor) seek for server-delegated data-view sources. Field-type agnostic: operator SQL is supplied by an injected resolver, so this owns drizzle and the seek correctness, not any field type.",
  // Pure compiler library — registers no contributions.
  contributions: [],
} satisfies ServerPluginDefinition;
