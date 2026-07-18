import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

export type {
  KeysetColumnBinding,
  KeysetColumnMap,
  SortKey,
  Tiebreaker,
} from "./internal/seek";
export {
  buildSortKeys,
  orderByClauses,
  seekPredicate,
  keyValuesOf,
} from "./internal/seek";

export default {
  description:
    "Field-agnostic keyset (cursor) pagination machinery. Null-aware keyset seek/order-by compiler over drizzle SQL (server) paired with the browser-safe cursor codec + sort signature (core). No data-view dependency, so any server-delegated windowed query can reuse it.",
} satisfies ServerPluginDefinition;
