import {
  addTaskDependency,
  removeTaskDependency,
  listDependentIds,
  getTaskDependencyIds,
  withTaskStatusBatch,
} from "@plugins/tasks/plugins/tasks-core/server";

// Rewiring is a single logical operation ("replace edge A with edge B") that
// spans several dependency mutations. `withTaskStatusBatch` runs them all in one
// transaction and coalesces `tasks.statusChanged` to the net before→after per
// task, so a momentary zero-blocker intermediate state lives only inside the
// uncommitted transaction (invisible to the launch job, which reads a separate
// connection) and never emits a spurious `blocked → unblocked` trigger. Edge
// ordering is therefore irrelevant — remove-then-add is fine.
export async function rewireDependencies(opts: {
  newTaskId: string;
  targetId: string;
  relation: "followup" | "prerequisite";
  /** Followup only: rewire only these IDs. Omit to rewire ALL dependents. Empty array = rewire none. */
  selectiveInsertBefore?: string[];
  /** Prerequisite only: when true, don't transfer target's existing deps to the new task. */
  standalone?: boolean;
}): Promise<void> {
  await withTaskStatusBatch(async (tx) => {
    if (opts.relation === "followup") {
      await addTaskDependency(opts.newTaskId, opts.targetId, tx);
      const idsToRewire =
        opts.selectiveInsertBefore ?? (await listDependentIds(opts.targetId, tx));
      for (const depId of idsToRewire) {
        if (depId === opts.newTaskId) continue;
        await removeTaskDependency(depId, opts.targetId, tx);
        await addTaskDependency(depId, opts.newTaskId, tx);
      }
    } else {
      const targetDeps = opts.standalone
        ? []
        : await getTaskDependencyIds(opts.targetId, tx);
      await addTaskDependency(opts.targetId, opts.newTaskId, tx);
      for (const depId of targetDeps) {
        if (depId === opts.newTaskId) continue;
        await addTaskDependency(opts.newTaskId, depId, tx);
        await removeTaskDependency(opts.targetId, depId, tx);
      }
    }
  });
}
