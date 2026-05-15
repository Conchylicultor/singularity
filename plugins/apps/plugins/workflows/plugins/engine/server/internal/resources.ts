import { z } from "zod";
import { asc, desc } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { defineResource } from "@server/resources";
import {
  WorkflowDefinitionSchema,
  WorkflowExecutionSchema,
} from "../../core";
import { _workflowDefinitions, _workflowExecutions, _workflowExecutionSteps } from "./tables";

function serializeDefinition(row: typeof _workflowDefinitions.$inferSelect) {
  return {
    ...row,
    steps: row.steps ?? [],
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
    const allSteps = await db
      .select()
      .from(_workflowExecutionSteps)
      .orderBy(asc(_workflowExecutionSteps.stepIndex));

    const stepsByExecution = new Map<string, (typeof _workflowExecutionSteps.$inferSelect)[]>();
    for (const step of allSteps) {
      const list = stepsByExecution.get(step.executionId) ?? [];
      list.push(step);
      stepsByExecution.set(step.executionId, list);
    }

    return executions.map((exec) =>
      serializeExecution(exec, stepsByExecution.get(exec.id) ?? []),
    );
  },
});

export { serializeDefinition, serializeExecution, serializeExecutionStep };
