import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { defineJob, isSuspendSignal } from "@plugins/infra/plugins/jobs/server";
import { _workflowDefinitions, _workflowExecutions } from "./tables";
import { getExecutor } from "./executor-registry";
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

      await updateExecutionStep(execStep!.id, {
        status: "running",
        startedAt: new Date(),
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

      await updateExecutionStep(execStep!.id, {
        status: "completed",
        output: result.output,
        completedAt: new Date(),
      });
      lastOutput = result.output ?? null;

      if (result.branchKey && stepDef.nextStepMapping?.[result.branchKey]) {
        currentStepId = stepDef.nextStepMapping[result.branchKey] ?? null;
      } else {
        currentStepId = stepDef.next;
      }
    }

    await updateExecution(input.executionId, {
      status: "completed",
      completedAt: new Date(),
    });
  },
});
