import {
  defineStepExecutor,
  userInputSubmitted,
  type UserInputSubmittedPayload,
} from "@plugins/apps/plugins/workflows/plugins/engine/server";

/**
 * Wait-for-user-input step. `ctx.waitFor` suspends the durable workflow run
 * (throwing a SuspendSignal the engine's run-job catches) until a human submits
 * the form via the engine's submit endpoint, which emits `userInputSubmitted`.
 * MUST NOT be wrapped in try/catch — that would swallow the suspend sentinel.
 */
export const userInputExecutor = defineStepExecutor({
  pluginId: "user-input",
  async run({ execution, step, ctx }) {
    const payload = await ctx.waitFor<UserInputSubmittedPayload>(userInputSubmitted, {
      where: { executionId: execution.id, stepId: step.id },
    });
    // Null only on timeout; we set none, so this is a loud invariant violation.
    if (!payload) {
      throw new Error("user-input step resumed without a submitted payload");
    }
    return { output: payload.data };
  },
});
