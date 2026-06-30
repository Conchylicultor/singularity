import { and, eq, isNull } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { db } from "@plugins/database/server";
import { abortDurableRun } from "@plugins/infra/plugins/jobs/server";
import type { DefinitionStep } from "../../core";
import {
  _workflowDefinitions,
  _workflowExecutions,
  _workflowExecutionSteps,
} from "./tables";
import { _userInputSubmittedTriggers } from "./tables-events";

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
  return row;
}

export async function deleteDefinition(id: string) {
  await db.delete(_workflowDefinitions).where(eq(_workflowDefinitions.id, id));
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
      // Write-once start time: this INSERT is memoized via `ctx.step`, so a
      // resume-after-suspend replay reuses the recorded row and never rewrites
      // `startedAt`. (run-job's later mark-running update only sets `status`.)
      startedAt: new Date(),
    })
    .returning();
  return row;
}

/**
 * Idempotently records a step's wait deadline. The `IS NULL` guard makes
 * replays no-ops, so the stored value equals `firstSuspendTime + timeoutMs` and
 * matches the durable timeout racer's `run_at`. Do NOT route this through
 * `updateExecutionStep`, which writes unconditionally.
 */
export async function setStepExpiryIfUnset(stepId: string, expiresAt: Date) {
  await db
    .update(_workflowExecutionSteps)
    .set({ expiresAt })
    .where(
      and(
        eq(_workflowExecutionSteps.id, stepId),
        isNull(_workflowExecutionSteps.expiresAt),
      ),
    );
}

/**
 * Cancels an execution and tears down its durable suspension state.
 * Status-first ordering: the terminal status is written before the durable run
 * is aborted, so run-job's non-memoized loop-top re-check sees `cancelled` and
 * bails — a late event then structurally cannot resurrect the run.
 *
 * 1. In one transaction: flip the execution and its suspended step(s) to
 *    `cancelled` with `completedAt`.
 * 2. `abortDurableRun` cancels the pending `_jobWaits` row + scheduled racers.
 * 3. Delete the execution's own `userInputSubmitted` trigger rows
 *    (defense-in-depth; the engine owns that event table).
 */
export async function cancelExecution(id: string) {
  const now = new Date();
  const [row] = await db.transaction(async (tx) => {
    const [execution] = await tx
      .update(_workflowExecutions)
      .set({ status: "cancelled", completedAt: now, updatedAt: now })
      .where(eq(_workflowExecutions.id, id))
      .returning();
    await tx
      .update(_workflowExecutionSteps)
      .set({ status: "cancelled", completedAt: now })
      .where(
        and(
          eq(_workflowExecutionSteps.executionId, id),
          eq(_workflowExecutionSteps.status, "suspended"),
        ),
      );
    return [execution];
  });

  await abortDurableRun(`workflows.run:${id}`);

  // `_userInputSubmittedTriggers` is exported as the generic `PgTable` shape;
  // dynamic column access mirrors the events plugin's own trigger-row deletes.
  // biome-ignore lint/suspicious/noExplicitAny: dynamic column access on untyped PgTable
  const executionIdCol = (_userInputSubmittedTriggers as any).executionId as AnyPgColumn;
  await db.delete(_userInputSubmittedTriggers).where(eq(executionIdCol, id));

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
}
