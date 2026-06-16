import type { TaskListItem } from "./resources";
import type { TaskStatus } from "@plugins/tasks/plugins/tasks-core/core";

// A done or dropped task is neither waiting on its dependencies nor blocking its
// own dependents, so it both drops out of the count and breaks the chain: we
// never count it and never traverse through it.
const TERMINAL_STATUSES: ReadonlySet<TaskStatus> = new Set(["done", "dropped"]);

// Counts the tasks transitively blocked by `taskId`, considering only dependents
// that are still active (not done or dropped). The traversal stops at terminal
// tasks so a completed/dropped intermediate doesn't carry the chain forward.
export function countTransitiveDependents(
  taskId: string,
  tasks: readonly TaskListItem[],
): number {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const dependentsOf = new Map<string, string[]>();
  for (const t of tasks) {
    for (const depId of t.dependencies) {
      const list = dependentsOf.get(depId);
      if (list) list.push(t.id);
      else dependentsOf.set(depId, [t.id]);
    }
  }
  const seen = new Set<string>();
  const stack = [...(dependentsOf.get(taskId) ?? [])];
  while (stack.length) {
    const cur = stack.pop()!;
    if (seen.has(cur)) continue;
    const task = byId.get(cur);
    if (!task || TERMINAL_STATUSES.has(task.status)) continue;
    seen.add(cur);
    const next = dependentsOf.get(cur);
    if (next) stack.push(...next);
  }
  return seen.size;
}
