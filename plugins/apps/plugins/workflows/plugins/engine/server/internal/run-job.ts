import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { defineJob, isSuspendSignal } from "@plugins/infra/plugins/jobs/server";
import { _workflowDefinitions, _workflowExecutions } from "./tables";
import { getExecutor } from "./executor-registry";
import { resolveNextStepId, resolveStepOutput } from "./step-flow";
import {
  createExecutionStep,
  updateExecution,
  updateExecutionStep,
} from "./mutations";
import type { DefinitionStep } from "../../core";
import type { StepResult } from "./executor-registry";

interface InitResult {
  definitionId: string;
  stepsMap: Record<string, DefinitionStep>;
  entryStepId: string | null;
}

export const workflowRunJob = defineJob({
  name: "workflows.run",
  input: z.object({ executionId: z.string() }),
  event: z.never(),
  dedup: { key: (input) => input.executionId },
  run: async ({ input, ctx }) => {
    const initResult = await ctx.step("init", async (): Promise<InitResult | null> => {
      const [execution] = await db
        .select()
        .from(_workflowExecutions)
        .where(eq(_workflowExecutions.id, input.executionId));
      if (!execution) return null;
      if (execution.status === "completed" || execution.status === "failed") return null;

      const [definition] = await db
        .select()
        .from(_workflowDefinitions)
        .where(eq(_workflowDefinitions.id, execution.definitionId));
      if (!definition) return null;

      if (execution.status === "pending") {
        await updateExecution(input.executionId, { status: "running" });
      }

      return {
        definitionId: execution.definitionId,
        stepsMap: (definition.steps ?? {}) as Record<string, DefinitionStep>,
        entryStepId: definition.entryStepId,
      };
    });

    if (!initResult) return;
    const { definitionId, stepsMap, entryStepId } = initResult;

    if (!entryStepId) {
      await updateExecution(input.executionId, { status: "completed", completedAt: new Date() });
      return;
    }

    let currentStepId: string | null = entryStepId;
    let executionOrder = 0;
    let lastOutput: unknown = null;

    while (currentStepId !== null) {
      // Non-memoized live terminal re-check, run on EVERY resume (outside
      // `ctx.step`, which would memoize it). The memoized `init` step's guard
      // never re-runs on resume, so a run resumed after cancel/expiry must see
      // live terminal state here and bail — closing the silent-resume-after-
      // cancel trap. A legitimate resume sees `suspended` and proceeds.
      const [live] = await db
        .select({ status: _workflowExecutions.status })
        .from(_workflowExecutions)
        .where(eq(_workflowExecutions.id, input.executionId));
      if (live && (live.status === "cancelled" || live.status === "expired")) return;

      const stepDef: DefinitionStep | undefined = stepsMap[currentStepId];
      if (!stepDef) {
        await updateExecution(input.executionId, { status: "failed", completedAt: new Date() });
        return;
      }

      const execStep = await ctx.step(`create-${currentStepId}`, () =>
        createExecutionStep({
          executionId: input.executionId,
          stepDef,
          executionOrder: executionOrder++,
          input: lastOutput,
        }),
      );

      // `startedAt` is written write-once inside the memoized `createExecutionStep`
      // INSERT, so this (non-memoized) mark-running write must NOT re-stamp it —
      // doing so would reset "Started Xm ago" on every resume.
      await updateExecutionStep(execStep!.id, {
        status: "running",
      });
      await updateExecution(input.executionId, {
        currentStepId: execStep!.id,
        status: "running",
      });

      const executor = getExecutor(stepDef.pluginId);
      if (!executor) {
        await updateExecutionStep(execStep!.id, {
          status: "failed",
          error: `No executor registered for "${stepDef.pluginId}"`,
          completedAt: new Date(),
        });
        await updateExecution(input.executionId, {
          status: "failed",
          completedAt: new Date(),
        });
        return;
      }

      let result: StepResult;
      try {
        result = await ctx.step(`exec-${execStep!.id}`, () =>
          executor.run({
            execution: { id: input.executionId, definitionId },
            step: { ...execStep!, input: lastOutput },
            ctx,
          }),
        );
      } catch (err) {
        if (isSuspendSignal(err)) {
          await updateExecutionStep(execStep!.id, { status: "suspended" });
          await updateExecution(input.executionId, { status: "suspended" });
          throw err;
        }
        const msg = err instanceof Error ? err.message : String(err);
        await updateExecutionStep(execStep!.id, {
          status: "failed",
          error: msg,
          completedAt: new Date(),
        });
        await updateExecution(input.executionId, {
          status: "failed",
          completedAt: new Date(),
        });
        throw err;
      }

      // A bounded wait elapsed with no event (e.g. user-input expiry). This is
      // a normal business outcome, handled on the normal post-exec path — the
      // executor returns `{ expired: true }` instead of throwing, so graphile
      // doesn't retry. Land step + execution in the terminal `expired` state.
      if (result.expired) {
        await updateExecutionStep(execStep!.id, {
          status: "expired",
          completedAt: new Date(),
        });
        await updateExecution(input.executionId, {
          status: "expired",
          completedAt: new Date(),
        });
        return;
      }

      // A step that omits `output` is transparent: its input flows through
      // unchanged so routing-only steps (branch) don't sever the pipeline. The
      // persisted output mirrors what flows downstream, keeping step N's output
      // consistent with step N+1's input.
      const nextOutput = resolveStepOutput(lastOutput, result);
      await updateExecutionStep(execStep!.id, {
        status: "completed",
        output: nextOutput,
        completedAt: new Date(),
      });
      lastOutput = nextOutput;

      currentStepId = resolveNextStepId(stepDef, result);
    }

    await updateExecution(input.executionId, {
      status: "completed",
      completedAt: new Date(),
    });
  },
});
