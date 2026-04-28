import { z } from "zod";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import {
  listAutoStartChildren,
  listAttemptsForTask,
  setTaskAutoStart,
} from "@plugins/tasks-core/server";
import { createConversation } from "./lifecycle";

// Job that launches every queued child of a parent task. Subscribed
// via tasks-core's taskStatusChanged event when the parent transitions to
// "done" (see plugins/tasks/server/internal/handle-create.ts).
//
// Idempotent under retry/duplicate emit: clears the autoStart columns after
// each launch, so a second invocation finds nothing to do. The
// `attemptId.length === 0` guard skips children a user manually launched
// between queue time and parent completion.
export const launchQueuedChildrenJob = defineJob({
  name: "tasks.launch-queued-children",
  input: z.object({ parentTaskId: z.string() }).passthrough(),
  run: async ({ parentTaskId }) => {
    const queued = await listAutoStartChildren(parentTaskId);
    for (const task of queued) {
      const attempts = await listAttemptsForTask(task.id);
      if (attempts.length > 0) {
        // User (or another job) already started this child between queue
        // time and parent completion. Just clear the queue marker.
        await setTaskAutoStart(task.id, null);
        continue;
      }
      const model = task.autoStartModel ?? "sonnet";
      try {
        await createConversation({
          taskId: task.id,
          model,
          spawnedBy: Bun.env.SINGULARITY_WORKTREE ?? "auto-start",
        });
      } finally {
        // Clear the queue marker even if launch fails so we don't loop on
        // retry; a stuck-on-failure child is better than a runaway spawn.
        await setTaskAutoStart(task.id, null);
      }
    }
  },
});

// Job that clears the queue markers on every queued child of a parent. Bound
// to taskStatusChanged for status='dropped' and status='held' so that a
// parent the user explicitly walks away from also walks away from its
// queued follow-ups (the children remain as plain tasks the user can
// launch manually).
export const cancelQueuedChildrenJob = defineJob({
  name: "tasks.cancel-queued-children",
  input: z.object({ parentTaskId: z.string() }).passthrough(),
  run: async ({ parentTaskId }) => {
    const queued = await listAutoStartChildren(parentTaskId);
    for (const task of queued) {
      await setTaskAutoStart(task.id, null);
    }
  },
});
