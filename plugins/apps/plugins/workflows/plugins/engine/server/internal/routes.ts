import { eq, desc, asc, and } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import {
  listDefinitions as listDefinitionsEndpoint,
  createDefinition as createDefinitionEndpoint,
  getDefinition as getDefinitionEndpoint,
  updateDefinition as updateDefinitionEndpoint,
  deleteDefinition as deleteDefinitionEndpoint,
  listExecutions as listExecutionsEndpoint,
  createExecution as createExecutionEndpoint,
  getExecution as getExecutionEndpoint,
  deleteExecution as deleteExecutionEndpoint,
  submitStep as submitStepEndpoint,
} from "../../core/endpoints";
import { _workflowDefinitions, _workflowExecutions, _workflowExecutionSteps } from "./tables";
import {
  createDefinition,
  updateDefinition,
  deleteDefinition,
  createExecution,
  cancelExecution,
} from "./mutations";
import {
  serializeDefinition,
  serializeExecution,
} from "./resources";
import { workflowRunJob } from "./run-job";
import { userInputSubmitted } from "./tables-events";

// ─── Definitions ──────────────────────────────────────────

export const handleListDefinitions = implement(listDefinitionsEndpoint, async () => {
  const rows = await db
    .select()
    .from(_workflowDefinitions)
    .orderBy(desc(_workflowDefinitions.createdAt));
  return rows.map(serializeDefinition);
});

export const handleCreateDefinition = implement(createDefinitionEndpoint, async ({ body }) => {
  const row = await createDefinition({
    name: body.name,
    description: body.description,
    steps: body.steps as Parameters<typeof createDefinition>[0]["steps"],
    entryStepId: body.entryStepId,
  });
  return serializeDefinition(row!);
});

export const handleGetDefinition = implement(getDefinitionEndpoint, async ({ params }) => {
  const [row] = await db
    .select()
    .from(_workflowDefinitions)
    .where(eq(_workflowDefinitions.id, params.id));
  if (!row) throw new HttpError(404, "Not found");
  return serializeDefinition(row);
});

export const handleUpdateDefinition = implement(updateDefinitionEndpoint, async ({ params, body }) => {
  const row = await updateDefinition(params.id, {
    name: body.name,
    description: body.description,
    steps: body.steps as Parameters<typeof updateDefinition>[1]["steps"],
    entryStepId: body.entryStepId,
  });
  if (!row) throw new HttpError(404, "Not found");
  return serializeDefinition(row);
});

export const handleDeleteDefinition = implement(deleteDefinitionEndpoint, async ({ params }) => {
  await deleteDefinition(params.id);
});

// ─── Executions ───────────────────────────────────────────

export const handleListExecutions = implement(listExecutionsEndpoint, async ({ req }) => {
  const url = new URL(req.url);
  const definitionId = url.searchParams.get("definitionId");

  const executions = await db
    .select()
    .from(_workflowExecutions)
    .where(
      definitionId
        ? eq(_workflowExecutions.definitionId, definitionId)
        : undefined,
    )
    .orderBy(desc(_workflowExecutions.createdAt));

  if (executions.length === 0) return [];

  const execIds = executions.map((e) => e.id);
  const allSteps = await db
    .select()
    .from(_workflowExecutionSteps)
    .orderBy(asc(_workflowExecutionSteps.executionOrder));

  const stepsByExec = new Map<string, (typeof _workflowExecutionSteps.$inferSelect)[]>();
  for (const step of allSteps) {
    if (!execIds.includes(step.executionId)) continue;
    const list = stepsByExec.get(step.executionId) ?? [];
    list.push(step);
    stepsByExec.set(step.executionId, list);
  }

  return executions.map((exec) => serializeExecution(exec, stepsByExec.get(exec.id) ?? []));
});

export const handleCreateExecution = implement(createExecutionEndpoint, async ({ body }) => {
  let execution;
  try {
    execution = await createExecution(body.definitionId);
  } catch (err) {
    if (err instanceof Error && err.message.includes("not found")) {
      throw new HttpError(404, err.message);
    }
    throw err;
  }

  await workflowRunJob.enqueue({ executionId: execution!.id });

  return serializeExecution(execution!, []);
});

export const handleGetExecution = implement(getExecutionEndpoint, async ({ params }) => {
  const [execution] = await db
    .select()
    .from(_workflowExecutions)
    .where(eq(_workflowExecutions.id, params.id));
  if (!execution) throw new HttpError(404, "Not found");

  const steps = await db
    .select()
    .from(_workflowExecutionSteps)
    .where(eq(_workflowExecutionSteps.executionId, params.id))
    .orderBy(asc(_workflowExecutionSteps.executionOrder));

  return serializeExecution(execution, steps);
});

export const handleDeleteExecution = implement(deleteExecutionEndpoint, async ({ params }) => {
  const row = await cancelExecution(params.id);
  if (!row) throw new HttpError(404, "Not found");
});

// ─── Submit ───────────────────────────────────────────────

export const handleSubmitStep = implement(submitStepEndpoint, async ({ params, body }) => {
  const [execution] = await db
    .select()
    .from(_workflowExecutions)
    .where(eq(_workflowExecutions.id, params.execId));
  if (!execution) throw new HttpError(404, "Execution not found");

  const [step] = await db
    .select()
    .from(_workflowExecutionSteps)
    .where(
      and(
        eq(_workflowExecutionSteps.id, params.stepId),
        eq(_workflowExecutionSteps.executionId, params.execId),
      ),
    );
  if (!step) throw new HttpError(404, "Step not found");
  if (step.status !== "suspended") {
    throw new HttpError(409, `Step status is "${step.status}", expected "suspended"`);
  }

  await userInputSubmitted.emit({
    executionId: params.execId,
    stepId: params.stepId,
    data: body.data ?? {},
  });
});
