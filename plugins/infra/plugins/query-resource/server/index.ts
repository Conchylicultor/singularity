import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

export { compileQuery, queryResource } from "./internal/compile";
export type { CompiledQuery } from "./internal/compile";
export { rel } from "./internal/rel";
export type {
  Edge,
  EntitySource,
  QueryDb,
  QueryResourceSpec,
  QuerySource,
  SelectMap,
} from "./internal/spec";

export default {
  description:
    "Declarative SQL query→resource compiler: one drizzle-based declaration derives the loader, scoped loader, identityTable, and client keyOf for keyed live-state resources.",
} satisfies ServerPluginDefinition;
