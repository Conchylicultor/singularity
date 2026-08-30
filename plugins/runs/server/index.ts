import {
  Resource,
  type ServerPluginDefinition,
} from "@plugins/framework/plugins/server-core/core";
import { queryRuns } from "../core";
import { handleRunsQuery } from "./internal/handle-query";
import { runsRevisionServerResource } from "./internal/revision-resource";

export { defineRunKind, getRunKinds } from "./internal/registry";
export type {
  RunKind,
  RunKindSpec,
  RunArmBaseColumns,
} from "./internal/registry";
export { durationMsExpr } from "./internal/arms";

export default {
  description:
    "The run-kind registry and the one query behind the merged run space: defineRunKind binds a domain's own ledger into the union (base columns typed against the base declaration, extra columns typed against the arm's own field declaration), POST /api/runs/query compiles every registered arm into one keyset page, and runs.revision is the scalar tick that refreshes the loaded window. Names no run kind.",
  httpRoutes: {
    [queryRuns.route]: handleRunsQuery,
  },
  contributions: [Resource.Declare(runsRevisionServerResource)],
} satisfies ServerPluginDefinition;
