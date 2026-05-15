import type { ServerPluginDefinition } from "@server/types";
import { Resource } from "@server/resources";
import { workflowRunJob } from "./internal/run-job";
import { userInputSubmitted } from "./internal/tables-events";
import { workflowDefinitionsResource, workflowExecutionsResource } from "./internal/resources";
import {
  handleListDefinitions,
  handleCreateDefinition,
  handleGetDefinition,
  handleUpdateDefinition,
  handleDeleteDefinition,
  handleListExecutions,
  handleCreateExecution,
  handleGetExecution,
  handleDeleteExecution,
  handleSubmitStep,
} from "./internal/routes";

export { _workflowDefinitions, _workflowExecutions, _workflowExecutionSteps } from "./internal/tables";
export { userInputSubmitted, _userInputSubmittedTriggers } from "./internal/tables-events";
export { defineStepExecutor, getExecutor } from "./internal/executor-registry";
export type { StepExecutorSpec, StepResult, StepExecutorRunArgs } from "./internal/executor-registry";
export { workflowDefinitionsResource, workflowExecutionsResource } from "./internal/resources";

export default {
  id: "workflows-engine",
  name: "Workflows: Engine",
  description:
    "Core backend infrastructure for the workflows app. Owns DB tables, step executor registry, durable run job, trigger event, HTTP API, and live-state resources.",
  httpRoutes: {
    "GET /api/workflows/definitions": handleListDefinitions,
    "POST /api/workflows/definitions": handleCreateDefinition,
    "GET /api/workflows/definitions/:id": handleGetDefinition,
    "PATCH /api/workflows/definitions/:id": handleUpdateDefinition,
    "DELETE /api/workflows/definitions/:id": handleDeleteDefinition,
    "GET /api/workflows/executions": handleListExecutions,
    "POST /api/workflows/executions": handleCreateExecution,
    "GET /api/workflows/executions/:id": handleGetExecution,
    "DELETE /api/workflows/executions/:id": handleDeleteExecution,
    "POST /api/workflows/executions/:execId/steps/:stepId/submit": handleSubmitStep,
  },
  register: [workflowRunJob, userInputSubmitted],
  contributions: [
    Resource.Declare(workflowDefinitionsResource),
    Resource.Declare(workflowExecutionsResource),
  ],
} satisfies ServerPluginDefinition;
