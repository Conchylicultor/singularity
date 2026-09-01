import {
  Resource,
  type ServerPluginDefinition,
} from "@plugins/framework/plugins/server-core/core";
import { getRun, queryRuns } from "../core";
import { handleRunGet } from "./internal/handle-get";
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
    "The run-kind registry and the one query behind the merged run space: defineRunKind binds a domain's own ledger into the union (base columns typed against the base declaration, extra columns typed against the arm's own field declaration), POST /api/runs/query compiles every registered arm into one keyset page, GET /api/runs/:kind/:id compiles the one arm that owns the kind against every arm's column specs so a single row comes back shaped exactly like a listed one, and runs.revision is the scalar tick that refreshes the loaded window. Names no run kind.",
  httpRoutes: {
    [queryRuns.route]: handleRunsQuery,
    [getRun.route]: handleRunGet,
  },
  contributions: [Resource.Declare(runsRevisionServerResource)],
} satisfies ServerPluginDefinition;
