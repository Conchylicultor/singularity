import { z } from "zod";
import { asc, eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { defineJob, isSuspendSignal } from "@plugins/infra/plugins/jobs/server";
import { _workflowExecutions, _workflowExecutionSteps } from "./tables";
import { getExecutor } from "./executor-registry";
import { updateExecution, updateExecutionStep } from "./mutations";
import type { StepResult } from "./executor-registry";

interface InitResult {
  definitionId: string;
  execSteps: {
    id: string;
    definitionStepId: string;
    stepIndex: number;
    stepPluginId: string;
    label: string;
    config: Record<string, unknown>;
    nextStepMapping: Record<string, string> | null;
  }[];
}

export const workflowRunJob = defineJob({
  name: "workflows.run",
  input: z.object({ executionId: z.string() }),
  event: z.never(),
  run: async ({ input, ctx }) => {
    const initResult = await ctx.step("init", async (): Promise<InitResult | null> => {
      const [execution] = await db
        .select()
        .from(_workflowExecutions)
        .where(eq(_workflowExecutions.id, input.executionId));
      if (!execution) return null;
      if (execution.status === "completed" || execution.status === "failed") return null;

      if (execution.status === "pending") {
        await updateExecution(input.executionId, { status: "running" });
      }

      // Steps are already created by createExecution in mutations.ts
      const rows = await db
        .select()
        .from(_workflowExecutionSteps)
        .where(eq(_workflowExecutionSteps.executionId, input.executionId))
        .orderBy(asc(_workflowExecutionSteps.stepIndex));

      return {
        definitionId: execution.definitionId,
        execSteps: rows.map((r) => ({
          id: r.id,
          definitionStepId: r.definitionStepId,
          stepIndex: r.stepIndex,
          stepPluginId: r.stepPluginId,
          label: r.label,
          config: (r.config ?? {}) as Record<string, unknown>,
          nextStepMapping: r.nextStepMapping as Record<string, string> | null,
        })),
      };
    });

    if (!initResult) return;
    const { definitionId, execSteps } = initResult;
    if (execSteps.length === 0) {
      await updateExecution(input.executionId, { status: "completed", completedAt: new Date() });
      return;
    }

    let lastOutput: unknown = null;
    let currentIndex = 0;

    while (currentIndex < execSteps.length) {
      const execStep = execSteps[currentIndex];

      await updateExecutionStep(execStep.id, {
        input: lastOutput,
        status: "running",
        startedAt: new Date(),
      });
      await updateExecution(input.executionId, {
        currentStepId: execStep.id,
        status: "running",
      });

      const executor = getExecutor(execStep.stepPluginId);
      if (!executor) {
        await updateExecutionStep(execStep.id, {
          status: "failed",
          error: `No executor registered for "${execStep.stepPluginId}"`,
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
        result = await ctx.step(`exec-${execStep.id}`, () =>
          executor.run({
            execution: { id: input.executionId, definitionId },
            step: { ...execStep, input: lastOutput },
            ctx,
          }),
        );
      } catch (err) {
        if (isSuspendSignal(err)) {
          await updateExecutionStep(execStep.id, { status: "suspended" });
          await updateExecution(input.executionId, { status: "suspended" });
          throw err;
        }
        const msg = err instanceof Error ? err.message : String(err);
        await updateExecutionStep(execStep.id, {
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

      await updateExecutionStep(execStep.id, {
        status: "completed",
        output: result.output,
        completedAt: new Date(),
      });
      lastOutput = result.output ?? null;

      if (result.branchKey && execStep.nextStepMapping) {
        const targetDefStepId = execStep.nextStepMapping[result.branchKey];
        if (targetDefStepId) {
          const targetIndex = execSteps.findIndex(
            (s) => s.definitionStepId === targetDefStepId,
          );
          if (targetIndex >= 0) {
            for (let i = currentIndex + 1; i < targetIndex; i++) {
              await updateExecutionStep(execSteps[i].id, { status: "skipped" });
            }
            currentIndex = targetIndex;
            continue;
          }
        }
      }
      currentIndex++;
    }

    await updateExecution(input.executionId, {
      status: "completed",
      completedAt: new Date(),
    });
  },
});
