import type { TaskListItem } from "./resources";

export function countTransitiveDependents(
  taskId: string,
  tasks: readonly TaskListItem[],
): number {
  const dependentsOf = new Map<string, string[]>();
  for (const t of tasks) {
    for (const depId of t.dependencies) {
      const list = dependentsOf.get(depId);
      if (list) list.push(t.id);
      else dependentsOf.set(depId, [t.id]);
    }
  }
  const seen = new Set<string>();
  const stack = dependentsOf.get(taskId) ?? [];
  while (stack.length) {
    const cur = stack.pop()!;
    if (seen.has(cur)) continue;
    seen.add(cur);
    const next = dependentsOf.get(cur);
    if (next) stack.push(...next);
  }
  return seen.size;
}
