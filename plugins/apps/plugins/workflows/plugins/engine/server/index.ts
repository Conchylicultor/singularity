import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
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
import {
  listDefinitions,
  createDefinition,
  getDefinition,
  updateDefinition,
  deleteDefinition,
  listExecutions,
  createExecution,
  getExecution,
  deleteExecution,
  submitStep,
} from "../core/endpoints";

export { _workflowDefinitions, _workflowExecutions, _workflowExecutionSteps } from "./internal/tables";
export { userInputSubmitted, _userInputSubmittedTriggers } from "./internal/tables-events";
export { defineStepExecutor, getExecutor } from "./internal/executor-registry";
export type { StepExecutorSpec, StepResult, StepExecutorRunArgs } from "./internal/executor-registry";
export { workflowDefinitionsResource, workflowExecutionsResource } from "./internal/resources";

export default {
  description:
    "Core backend infrastructure for the workflows app. Owns DB tables, step executor registry, durable run job, trigger event, HTTP API, and live-state resources.",
  httpRoutes: {
    [listDefinitions.route]: handleListDefinitions,
    [createDefinition.route]: handleCreateDefinition,
    [getDefinition.route]: handleGetDefinition,
    [updateDefinition.route]: handleUpdateDefinition,
    [deleteDefinition.route]: handleDeleteDefinition,
    [listExecutions.route]: handleListExecutions,
    [createExecution.route]: handleCreateExecution,
    [getExecution.route]: handleGetExecution,
    [deleteExecution.route]: handleDeleteExecution,
    [submitStep.route]: handleSubmitStep,
  },
  register: [workflowRunJob, userInputSubmitted],
  contributions: [
    Resource.Declare(workflowDefinitionsResource),
    Resource.Declare(workflowExecutionsResource),
  ],
} satisfies ServerPluginDefinition;
