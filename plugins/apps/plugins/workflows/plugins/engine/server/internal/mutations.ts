import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import type { DefinitionStep } from "../../core";
import {
  _workflowDefinitions,
  _workflowExecutions,
  _workflowExecutionSteps,
} from "./tables";
import { workflowDefinitionsResource, workflowExecutionsResource } from "./resources";

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function createDefinition(input: {
  name: string;
  description?: string | null;
  steps?: Record<string, DefinitionStep>;
  entryStepId?: string | null;
}) {
  const id = generateId("wfdef");
  const [row] = await db
    .insert(_workflowDefinitions)
    .values({
      id,
      name: input.name,
      description: input.description ?? null,
      steps: input.steps ?? {},
      entryStepId: input.entryStepId ?? null,
    })
    .returning();
  workflowDefinitionsResource.notify();
  return row;
}

export async function updateDefinition(
  id: string,
  patch: {
    name?: string;
    description?: string | null;
    steps?: Record<string, DefinitionStep>;
    entryStepId?: string | null;
  },
) {
  const values: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.name !== undefined) values.name = patch.name;
  if (patch.description !== undefined) values.description = patch.description;
  if (patch.steps !== undefined) values.steps = patch.steps;
  if (patch.entryStepId !== undefined) values.entryStepId = patch.entryStepId;

  const [row] = await db
    .update(_workflowDefinitions)
    .set(values)
    .where(eq(_workflowDefinitions.id, id))
    .returning();
  workflowDefinitionsResource.notify();
  return row;
}

export async function deleteDefinition(id: string) {
  await db.delete(_workflowDefinitions).where(eq(_workflowDefinitions.id, id));
  workflowDefinitionsResource.notify();
  workflowExecutionsResource.notify();
}

export async function createExecution(definitionId: string) {
  const [def] = await db
    .select()
    .from(_workflowDefinitions)
    .where(eq(_workflowDefinitions.id, definitionId));
  if (!def) throw new Error(`Definition ${definitionId} not found`);

  const executionId = generateId("wfex");
  const [execution] = await db
    .insert(_workflowExecutions)
    .values({ id: executionId, definitionId })
    .returning();

  workflowExecutionsResource.notify();
  return execution;
}

export async function createExecutionStep(params: {
  executionId: string;
  stepDef: DefinitionStep;
  executionOrder: number;
  input: unknown;
}) {
  const id = generateId("wfes");
  const [row] = await db
    .insert(_workflowExecutionSteps)
    .values({
      id,
      executionId: params.executionId,
      definitionStepId: params.stepDef.id,
      executionOrder: params.executionOrder,
      stepPluginId: params.stepDef.pluginId,
      label: params.stepDef.label,
      config: params.stepDef.config ?? {},
      next: params.stepDef.next ?? null,
      nextStepMapping: params.stepDef.nextStepMapping ?? null,
      input: params.input,
    })
    .returning();
  workflowExecutionsResource.notify();
  return row;
}

export async function cancelExecution(id: string) {
  const [row] = await db
    .update(_workflowExecutions)
    .set({ status: "failed", completedAt: new Date(), updatedAt: new Date() })
    .where(eq(_workflowExecutions.id, id))
    .returning();
  workflowExecutionsResource.notify();
  return row;
}

export async function updateExecution(
  id: string,
  patch: {
    status?: string;
    currentStepId?: string | null;
    completedAt?: Date | null;
  },
) {
  const values: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.status !== undefined) values.status = patch.status;
  if (patch.currentStepId !== undefined) values.currentStepId = patch.currentStepId;
  if (patch.completedAt !== undefined) values.completedAt = patch.completedAt;

  await db
    .update(_workflowExecutions)
    .set(values)
    .where(eq(_workflowExecutions.id, id));
  workflowExecutionsResource.notify();
}

export async function updateExecutionStep(
  id: string,
  patch: {
    status?: string;
    input?: unknown;
    output?: unknown;
    error?: string | null;
    startedAt?: Date | null;
    completedAt?: Date | null;
  },
) {
  const values: Record<string, unknown> = {};
  if (patch.status !== undefined) values.status = patch.status;
  if (patch.input !== undefined) values.input = patch.input;
  if (patch.output !== undefined) values.output = patch.output;
  if (patch.error !== undefined) values.error = patch.error;
  if (patch.startedAt !== undefined) values.startedAt = patch.startedAt;
  if (patch.completedAt !== undefined) values.completedAt = patch.completedAt;

  await db
    .update(_workflowExecutionSteps)
    .set(values)
    .where(eq(_workflowExecutionSteps.id, id));
  workflowExecutionsResource.notify();
}
