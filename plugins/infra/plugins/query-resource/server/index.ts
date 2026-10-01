import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

export { compileQuery, compileEdges, queryResource } from "./internal/compile";
export type { CompiledQuery } from "./internal/compile";
export {
  deferredWindowQueryResource,
  windowQueryResource,
} from "./internal/compile-window";
export { compileGroupsQuery } from "./internal/compile-groups";
export { compileJoins, joinRefs } from "./internal/joins";
export type { ReadColumn } from "./internal/joins";
export type { CompiledGroups } from "./internal/compile-groups";
export { rel } from "./internal/rel";
export type {
  Edge,
  EntitySource,
  Hop,
  QueryDb,
  QueryResourceSpec,
  QuerySource,
  RoutedSource,
  SelectMap,
  WindowOrderKey,
  WindowQueryResourceSpec,
} from "./internal/spec";

export default {
  description:
    "Declarative SQL query→resource compiler: one drizzle-based declaration derives the loader, scoped loader, scope policy (an identityTable, or for a bounded window / point set and a grouping the routes the change router serves it by), and client keyOf for live-state resources.",
} satisfies ServerPluginDefinition;
