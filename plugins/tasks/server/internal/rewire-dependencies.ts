import {
  addTaskDependency,
  removeTaskDependency,
  listDependentIds,
  getTaskDependencyIds,
} from "@plugins/tasks-core/server";

export async function rewireDependencies(opts: {
  newTaskId: string;
  targetId: string;
  relation: "followup" | "prerequisite";
  /** Followup only: rewire only these IDs. Omit to rewire ALL dependents of target. */
  selectiveInsertBefore?: string[];
}): Promise<void> {
  if (opts.relation === "followup") {
    await addTaskDependency(opts.newTaskId, opts.targetId);
    const idsToRewire =
      opts.selectiveInsertBefore ?? (await listDependentIds(opts.targetId));
    for (const depId of idsToRewire) {
      if (depId === opts.newTaskId) continue;
      await removeTaskDependency(depId, opts.targetId);
      await addTaskDependency(depId, opts.newTaskId);
    }
  } else {
    const targetDeps = await getTaskDependencyIds(opts.targetId);
    for (const depId of targetDeps) {
      await removeTaskDependency(opts.targetId, depId);
      await addTaskDependency(opts.newTaskId, depId);
    }
    await addTaskDependency(opts.targetId, opts.newTaskId);
  }
}
