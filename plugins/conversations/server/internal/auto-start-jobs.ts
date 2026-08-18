import { z } from "zod";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import { db } from "@plugins/database/server";
import { isMain } from "@plugins/infra/plugins/paths/server";
import {
  getTask,
  hasBlockingDep,
  listAttemptsForTask,
} from "@plugins/tasks/plugins/tasks-core/server";
import {
  buildTaskPrompt,
  TaskStatusSchema,
} from "@plugins/tasks/plugins/tasks-core/core";
import {
  claimAutoStart,
  getTaskAutoStart,
} from "@plugins/tasks/plugins/auto-start/server";
import { createConversation } from "./lifecycle";

// Job that launches a queued task once all its dependencies are non-blocking.
// Invoked by maybeLaunchOnStatusJob (static trigger on taskStatusChanged), by
// armTaskAutoStart when a task is armed, and by the boot reconcile warm-up.
//
// Concurrency: triggers can fire concurrently (multiple deps flipping at
// once, or retried jobs). The atomic claimAutoStart() acts as a CAS on
// auto_start_at — exactly one runner wins and proceeds to launch; all
// others see the marker already cleared and exit.
//
// Dedup on taskId: since the status event became closure-correct, one settle
// on a task with many dependents can wake this job for the same task several
// times over, and the boot reconcile enqueues it for every armed task at once.
// Collapsing repeat wake-ups for ONE task onto one graphile row is safe
// precisely because claimAutoStart is the exactly-once gate — the collapsed
// row does the same single check the N rows would have done.
export const maybeLaunchTaskJob = defineJob({
  name: "tasks.maybe-launch",
  input: z.object({
    taskId: z.string(),
    cause: z.string().default("dep-resolved"),
  }),
  event: z.never(),
  dedup: { key: ({ taskId }) => taskId },
  run: async ({ input: { taskId, cause } }) => {
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
    // dropTaskTree drops a whole subtree then emits taskStatusChanged for each
    // node — the dependents (also dropped) would pass hasBlockingDep because
    // dropped deps are non-blocking. Bail if the task itself is dropped/held.
    if (t.droppedAt || t.heldAt) return;
    const ext = await getTaskAutoStart(taskId);
    if (!ext) {
      console.warn(
        `[tasks.maybe-launch] task ${taskId} has no auto_start row; trigger fired but no launch (already launched, cancelled, or never armed)`,
      );
      return;
    }
    // Some other dep is still blocking; another trigger will fire later.
    if (await hasBlockingDep(taskId, db)) return;

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
      spawnedBy: cause,
    });
  },
});

// Static trigger target: fires on every taskStatusChanged and re-checks the
// auto-start eligibility of the task whose status changed. That is the whole
// rule now — there is no fan-out to dependents any more.
//
// Why one task is enough. `tasks.statusChanged` used to be emitted only for the
// task ids a call site remembered to name, so it fired for the endpoint of an
// edge write and never for the downstream tasks whose derived status that write
// had just changed. It is now emitted for `{T} ∪ transitiveDependents(T)`,
// derived from the graph inside the write itself
// (tasks-core `withTaskStatusChange`). So a task that becomes launchable
// because something upstream moved gets its OWN event.
//
// And for an armed, attempt-less, undropped, unheld task, `blocked` is exactly
// the status it carries while it is not launchable. So "becomes launchable" and
// "leaves blocked" are the same event once the event is closure-correct — which
// is why the old two-case shape is gone: the armed-dependents fan-out has
// nothing left to find, and the `previousStatus === "blocked"` condition on the
// direct case would only re-exclude the un-dropped / un-held task it was meant
// to catch.
//
// The fan-out was not merely redundant — it was UNABLE to cover the case that
// motivated this: it walked `task_dependencies` for armed dependents of the
// settled task, and when the unblocking write was an edge REMOVAL, the walk ran
// over an edge that no longer existed and reached nobody.
//
// The armed-marker guard below is what keeps the now-wider event stream from
// amplifying into launch jobs: a settle on a task with 47 dependents emits up
// to 48 events, and all but the armed ones stop here on one indexed read.
// maybeLaunchTaskJob remains the exactly-once gate (dropped/held? armed?
// unblocked? unclaimed? no existing attempt?), so waking it for a task that
// turns out to be ineligible is a safe no-op.
//
// A consequence worth naming: this rule keys on NO status at all, so a new
// status is not something it has to be taught. `in_progress_blocked` arrived
// while this change was in flight and needed an `isBlockedStatus` predicate in
// the old `previousStatus === "blocked"` condition; here it needs nothing —
// maybeLaunchTaskJob asks `hasBlockingDep` directly rather than reading a
// status, so the gate cannot fall out of step with the status vocabulary.
//
// This intermediary job cannot be collapsed into maybeLaunchTaskJob itself: a
// Trigger's `with` is a static input, and `taskId` arrives on the separate
// `event` argument, so the launch job cannot bind to the event directly.
export const maybeLaunchOnStatusJob = defineJob({
  name: "tasks.maybe-launch-on-status",
  input: z.object({}),
  dedup: "none",
  event: z
    .object({
      taskId: z.string(),
      folderId: z.string().nullable(),
      status: TaskStatusSchema,
      previousStatus: TaskStatusSchema,
    })
    .passthrough(),
  run: async ({ event }) => {
    if (!event) return;
    // Cheap indexed guard: the overwhelming majority of status changes are on
    // tasks nobody armed, and they cost one primary-key read each.
    if (!(await getTaskAutoStart(event.taskId))) return;
    await maybeLaunchTaskJob.enqueue({
      taskId: event.taskId,
      cause: "status-changed",
    });
  },
});
