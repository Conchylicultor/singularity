import {
  addTaskDependency,
  removeTaskDependency,
  listDependentIds,
  getTaskDependencyIds,
} from "@plugins/tasks/plugins/tasks-core/server";

// Rewiring is a single logical operation ("replace edge A with edge B") but is
// implemented as separate, individually-committed dependency mutations. Each
// mutation emits its own `tasks.statusChanged` trigger (see
// mutations/tasks.ts → emitStatusChangeIfChanged). If we ever REMOVE a task's
// last blocking edge before ADDING its replacement, the task is momentarily
// committed with zero blockers — `removeTaskDependency` then emits a spurious
// `blocked → unblocked` transition. That drives `maybeLaunchDependentsJob`
// (Case 2) to launch an already-armed task even though it is about to be
// re-blocked by the new edge, because the launch job's `hasBlockingDep`
// re-check races the not-yet-committed re-add.
//
// The invariant that closes the race: NEVER expose a zero-blocker intermediate
// state. Always ADD the replacement blocking edge BEFORE removing the old one.
// The task then stays blocked throughout (dep on {old, new} → {new}), and
// emitStatusChangeIfChanged sees `blocked → blocked` and suppresses the emit —
// no spurious trigger, no premature launch. (See task-2 below for the deeper,
// class-wide fix: wrap a rewire in one transaction and emit on the net effect.)
export async function rewireDependencies(opts: {
  newTaskId: string;
  targetId: string;
  relation: "followup" | "prerequisite";
  /** Followup only: rewire only these IDs. Omit to rewire ALL dependents. Empty array = rewire none. */
  selectiveInsertBefore?: string[];
  /** Prerequisite only: when true, don't transfer target's existing deps to the new task. */
  standalone?: boolean;
}): Promise<void> {
  if (opts.relation === "followup") {
    await addTaskDependency(opts.newTaskId, opts.targetId);
    const idsToRewire =
      opts.selectiveInsertBefore ?? (await listDependentIds(opts.targetId));
    for (const depId of idsToRewire) {
      if (depId === opts.newTaskId) continue;
      // Add-before-remove: depId depends on {targetId, newTaskId} → {newTaskId},
      // staying blocked the whole time.
      await addTaskDependency(depId, opts.newTaskId);
      await removeTaskDependency(depId, opts.targetId);
    }
  } else {
    // Snapshot target's deps BEFORE we add the new blocking edge, so the
    // transfer loop below never sees newTaskId as one of them.
    const targetDeps = opts.standalone
      ? []
      : await getTaskDependencyIds(opts.targetId);
    // Add the new blocking edge FIRST so `targetId` never observes a
    // zero-blocker intermediate state while its existing deps are transferred.
    await addTaskDependency(opts.targetId, opts.newTaskId);
    for (const depId of targetDeps) {
      if (depId === opts.newTaskId) continue;
      await addTaskDependency(opts.newTaskId, depId);
      await removeTaskDependency(opts.targetId, depId);
    }
  }
}
