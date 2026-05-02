import { z } from "zod";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import {
  claimAutoStart,
  getTask,
  hasBlockingDep,
  listAttemptsForTask,
} from "@plugins/tasks-core/server";
import { buildTaskPrompt } from "@plugins/tasks-core/shared";
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

    // Atomic claim: only one concurrent runner gets `true`. Every other
    // enqueue (duplicate trigger, retry, racing dep flip) sees the marker
    // already cleared and bails here without launching.
    if (!(await claimAutoStart(taskId))) return;

    // Manual start could have raced in before our claim; if so, exit.
    // Marker is already cleared by the claim, so no extra cleanup needed.
    const attempts = await listAttemptsForTask(taskId);
    if (attempts.length > 0) return;

    // Marker is cleared; if createConversation throws, retry is harmless
    // (next run sees autoStartAt null and exits). A stuck-on-failure task
    // is better than a runaway spawn.
    const model = t.autoStartModel ?? "sonnet";
    await createConversation({
      taskId,
      model,
      prompt: buildTaskPrompt(t),
      spawnedBy: "auto-start",
    });
  },
});
