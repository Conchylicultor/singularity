import { z } from "zod";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import {
  getTask,
  hasBlockingDep,
  listAttemptsForTask,
  setTaskAutoStart,
} from "@plugins/tasks-core/server";
import { buildTaskPrompt } from "@plugins/tasks-core/shared";
import { createConversation } from "./lifecycle";

// Job that launches a queued task once all its dependencies are non-blocking.
// Subscribed via per-dep tasks-core taskStatusChanged triggers (status='done'
// or 'dropped') installed at queue time in plugins/tasks/server/internal/
// handle-create.ts. Idempotent: every guard short-circuits and clears the
// auto-start marker on success/failure so a duplicate emit no-ops.
//
// Early-returns log on the bug-signal paths (task gone or marker already
// cleared) since the trigger row was just deleted by the events dispatcher
// — silent skips on these paths historically masked orphaned auto_start_at
// rows that had no live trigger to ever fire them.
export const maybeLaunchTaskJob = defineJob({
  name: "tasks.maybe-launch",
  input: z.object({ taskId: z.string() }),
  event: z.never(),
  run: async ({ input: { taskId } }) => {
    const t = await getTask(taskId);
    if (!t) {
      console.warn(
        `[tasks.maybe-launch] task ${taskId} not found; trigger fired but no launch`,
      );
      return;
    }
    if (!t.autoStartAt) {
      console.warn(
        `[tasks.maybe-launch] task ${taskId} has no auto_start_at; trigger fired but no launch (already launched, cancelled, or never armed)`,
      );
      return;
    }
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
        prompt: buildTaskPrompt(t),
        spawnedBy: "auto-start",
      });
    } finally {
      // Clear the marker even if launch fails so we don't loop on retry; a
      // stuck-on-failure task is better than a runaway spawn.
      await setTaskAutoStart(taskId, null);
    }
  },
});
