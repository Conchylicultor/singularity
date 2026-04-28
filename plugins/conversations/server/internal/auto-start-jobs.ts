import { z } from "zod";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import {
  getTask,
  hasBlockingDep,
  listAttemptsForTask,
  setTaskAutoStart,
} from "@plugins/tasks-core/server";
import { createConversation } from "./lifecycle";

// Job that launches a queued task once all its dependencies are non-blocking.
// Subscribed via per-dep tasks-core taskStatusChanged triggers (status='done'
// or 'dropped') installed at queue time in plugins/tasks/server/internal/
// handle-create.ts. Idempotent: every guard short-circuits and clears the
// auto-start marker on success/failure so a duplicate emit no-ops.
export const maybeLaunchTaskJob = defineJob({
  name: "tasks.maybe-launch",
  input: z.object({ taskId: z.string() }).passthrough(),
  run: async ({ taskId }) => {
    const t = await getTask(taskId);
    // Already launched, cancelled, or task gone — nothing to do.
    if (!t || !t.autoStartAt) return;
    // Some other dep is still blocking; another trigger will fire later.
    if (await hasBlockingDep(taskId)) return;
    const attempts = await listAttemptsForTask(taskId);
    if (attempts.length > 0) {
      // User started it manually between queue time and unblock; clear the
      // marker so a future un-block doesn't double-launch.
      await setTaskAutoStart(taskId, null);
      return;
    }
    const model = t.autoStartModel ?? "sonnet";
    try {
      await createConversation({
        taskId,
        model,
        spawnedBy: Bun.env.SINGULARITY_WORKTREE ?? "auto-start",
      });
    } finally {
      // Clear the marker even if launch fails so we don't loop on retry; a
      // stuck-on-failure task is better than a runaway spawn.
      await setTaskAutoStart(taskId, null);
    }
  },
});
