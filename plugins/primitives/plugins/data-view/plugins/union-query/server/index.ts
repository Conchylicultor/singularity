import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

export type {
  UnionArm,
  CompileUnionPageArgs,
  CompiledUnionPage,
} from "./internal/compile-union";
export { compileUnionPage } from "./internal/compile-union";

export default {
  description:
    "Keyset-paginated UNION ALL compiler for server-delegated DataViews: merges N heterogeneous tables into one ordered row space. Owns the three things that are hard to get right and entirely field-agnostic — arm pruning, aligned typed-NULL projections, and pushing the compiled WHERE / keyset seek / LIMIT into each arm before the union. Arm pruning evaluates a conjunctive clause over an arm constant (typed NULL, discriminator) with the filter language's own op test, so a negative op keeps the arm. Composes server-query's compileWhere and primitives/keyset's seek; imports no field type.",
} satisfies ServerPluginDefinition;
