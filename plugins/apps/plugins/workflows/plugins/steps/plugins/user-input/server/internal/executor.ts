import {
  defineStepExecutor,
  setStepExpiryIfUnset,
  userInputSubmitted,
  type UserInputSubmittedPayload,
} from "@plugins/apps/plugins/workflows/plugins/engine/server";
import {
  resolveTimeoutMs,
  type ExpiresAfter,
} from "@plugins/apps/plugins/workflows/plugins/steps/plugins/user-input/core";

interface UserInputConfig {
  expiresAfter?: ExpiresAfter;
}

/**
 * Wait-for-user-input step. `ctx.waitFor` suspends the durable workflow run
 * (throwing a SuspendSignal the engine's run-job catches) until a human submits
 * the form via the engine's submit endpoint, which emits `userInputSubmitted`.
 * The wait is bounded by a configurable deadline (`expiresAfter`, default 7d):
 * on timeout `ctx.waitFor` returns `null` and we return `{ expired: true }` — a
 * normal business outcome run-job lands as the terminal `expired` state (NOT a
 * throw, which would trigger graphile retries). MUST NOT be wrapped in
 * try/catch — that would swallow the suspend sentinel.
 */
export const userInputExecutor = defineStepExecutor({
  pluginId: "user-input",
  async run({ execution, step, ctx }) {
    const timeoutMs = resolveTimeoutMs(step.config as UserInputConfig);
    // Persist the deadline once (idempotent on replay) so the UI can render a
    // countdown. Written before suspending; the value equals firstSuspend +
    // timeoutMs and matches the durable timeout racer's run_at.
    await setStepExpiryIfUnset(step.id, new Date(Date.now() + timeoutMs));

    const payload = await ctx.waitFor<UserInputSubmittedPayload>(userInputSubmitted, {
      where: { executionId: execution.id, stepId: step.id },
      timeoutMs,
    });
    // Null means the deadline elapsed with no submission — a bounded-wait expiry.
    if (!payload) {
      return { expired: true };
    }
    return { output: payload.data };
  },
});
