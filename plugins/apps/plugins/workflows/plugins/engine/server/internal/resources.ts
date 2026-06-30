import { z } from "zod";
import { asc, desc, inArray } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import {
  WorkflowDefinitionSchema,
  WorkflowExecutionSchema,
} from "../../core";
import { _workflowDefinitions, _workflowExecutions, _workflowExecutionSteps } from "./tables";

function serializeDefinition(row: typeof _workflowDefinitions.$inferSelect) {
  return {
    ...row,
    steps: row.steps ?? {},
    entryStepId: row.entryStepId ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeExecutionStep(row: typeof _workflowExecutionSteps.$inferSelect) {
  return {
    ...row,
    config: row.config ?? {},
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
  };
}

function serializeExecution(
  row: typeof _workflowExecutions.$inferSelect,
  steps: (typeof _workflowExecutionSteps.$inferSelect)[],
) {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    steps: steps.map(serializeExecutionStep),
  };
}

/**
 * Serializes a list of executions together with their steps, fetching the steps
 * in a single query scoped to exactly the given executions via `inArray` — which
 * hits the `wf_exec_steps_exec_idx` index instead of scanning the whole
 * step-trace table. Shared by the executions list endpoint and the live-state
 * resource loader so the scoped read lives in one place.
 */
async function serializeExecutionsWithSteps(
  executions: (typeof _workflowExecutions.$inferSelect)[],
) {
  if (executions.length === 0) return [];

  const execIds = executions.map((e) => e.id);
  const steps = await db
    .select()
    .from(_workflowExecutionSteps)
    .where(inArray(_workflowExecutionSteps.executionId, execIds))
    .orderBy(asc(_workflowExecutionSteps.executionOrder));

  const stepsByExecution = new Map<string, (typeof _workflowExecutionSteps.$inferSelect)[]>();
  for (const step of steps) {
    const list = stepsByExecution.get(step.executionId) ?? [];
    list.push(step);
    stepsByExecution.set(step.executionId, list);
  }

  return executions.map((exec) =>
    serializeExecution(exec, stepsByExecution.get(exec.id) ?? []),
  );
}

export const workflowDefinitionsResource = defineResource({
  key: "workflow-definitions",
  mode: "push" as const,
  schema: z.array(WorkflowDefinitionSchema),
  loader: async () => {
    const rows = await db
      .select()
      .from(_workflowDefinitions)
      .orderBy(desc(_workflowDefinitions.createdAt));
    return rows.map(serializeDefinition);
  },
});

export const workflowExecutionsResource = defineResource({
  key: "workflow-executions",
  mode: "push" as const,
  schema: z.array(WorkflowExecutionSchema),
  loader: async () => {
    const executions = await db
      .select()
      .from(_workflowExecutions)
      .orderBy(desc(_workflowExecutions.createdAt));
    return serializeExecutionsWithSteps(executions);
  },
});

export {
  serializeDefinition,
  serializeExecution,
  serializeExecutionStep,
  serializeExecutionsWithSteps,
};
