import { z } from "zod";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import { isMain } from "@plugins/infra/plugins/paths/server";
import { getTask, hasBlockingDep, listAttemptsForTask } from "@plugins/tasks-core/server";
import { buildTaskPrompt } from "@plugins/tasks-core/shared";
import {
  claimAutoStart,
  getTaskAutoStart,
} from "@plugins/tasks/plugins/auto-start/server";
import { createConversation } from "./lifecycle";

// Job that launches a queued task once all its dependencies are non-blocking.
// Subscribed via per-dep tasks-core taskStatusChanged triggers (status='done'
// or 'dropped') installed at queue time in plugins/tasks/server/internal/
// handle-create.ts.
//
// Concurrency: triggers can fire concurrently (multiple deps flipping at
// once, or retried jobs). The atomic claimAutoStart() acts as a CAS on
// auto_start_at — exactly one runner wins and proceeds to launch; all
// others see the marker already cleared and exit.
export const maybeLaunchTaskJob = defineJob({
  name: "tasks.maybe-launch",
  input: z.object({ taskId: z.string() }),
  event: z.never(),
  run: async ({ input: { taskId } }) => {
    // Main-only: a forked sub-worktree DB inherits the autoStart marker and
    // taskStatusChanged triggers from main at fork time, so the same job
    // would fire independently in every worktree's worker — each calling
    // createConversation against its own DB and producing a parallel tmux
    // session. CAS protects within a single DB, not across forks.
    if (!isMain()) return;
    const t = await getTask(taskId);
    if (!t) {
      console.warn(
        `[tasks.maybe-launch] task ${taskId} not found; trigger fired but no launch`,
      );
      return;
    }
    const ext = await getTaskAutoStart(taskId);
    if (!ext) {
      console.warn(
        `[tasks.maybe-launch] task ${taskId} has no auto_start row; trigger fired but no launch (already launched, cancelled, or never armed)`,
      );
      return;
    }
    // Some other dep is still blocking; another trigger will fire later.
    if (await hasBlockingDep(taskId)) return;

    // Atomic claim: only one concurrent runner gets `true`. Every other
    // enqueue (duplicate trigger, retry, racing dep flip) sees the marker
    // already cleared and bails here without launching.
    if (!(await claimAutoStart(taskId))) return;

    // Manual start could have raced in before our claim; if so, exit.
    // Marker is already cleared by the claim, so no extra cleanup needed.
    const attempts = await listAttemptsForTask(taskId);
    if (attempts.length > 0) return;

    // Marker is cleared; if createConversation throws, retry is harmless
    // (next run sees no ext row and exits). A stuck-on-failure task
    // is better than a runaway spawn.
    const model = ext.autoStartModel;
    await createConversation({
      taskId,
      model,
      prompt: buildTaskPrompt(t),
      spawnedBy: "auto-start",
    });
  },
});
