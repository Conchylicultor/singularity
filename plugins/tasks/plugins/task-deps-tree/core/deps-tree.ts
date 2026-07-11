import { TaskGraph, type TaskListItem } from "@plugins/tasks/plugins/tasks-core/core";

// One row of the dependency TREE: a task plus the single tree edge that renders
// it (its primary parent) and the fan-in prerequisites shown as chips.
export interface DepsTreeRow extends TaskListItem {
  // Primary parent — the deterministic oldest-edge prerequisite still inside the
  // closure. `null` ⇒ this row is a root of the tree (renders top-level).
  depsParentId: string | null;
  // Remaining in-closure prerequisites beyond the primary parent (fan-in),
  // rendered as removable "also after: X" chips.
  extraDeps: TaskListItem[];
}

/**
 * Derive the dependency TREE rooted at `rootId` from the flat task list.
 *
 * The member set is the connected dependency component of `rootId` (blockers AND
 * dependents, groups excluded) — the same closure the graph section renders.
 * Every `task_dependencies` edge inside that component becomes a literal tree
 * edge: a task nests under its primary parent (the oldest edge in
 * `dependencies`, which `tasks_v` already orders by edge `createdAt`); any
 * further in-component prerequisites fan in as `extraDeps` chips. Multiple roots
 * render as top-level siblings; settled tasks stay in rows (muted at render).
 *
 * Returns `[]` when the component is just `rootId` alone (nothing to show).
 */
export function buildDepsTree(
  tasks: readonly TaskListItem[],
  rootId: string,
): DepsTreeRow[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  if (!byId.has(rootId)) return [];

  // closure() excludes rootId itself; the tree members are it plus the root.
  const memberIds = new Set<string>([
    rootId,
    ...TaskGraph.from(tasks)
      .closure(rootId, { includeGroups: false })
      .map((n) => n.id),
  ]);
  if (memberIds.size <= 1) return [];

  const rows: DepsTreeRow[] = [];
  for (const id of memberIds) {
    const task = byId.get(id);
    if (!task) continue;
    // In-component prerequisites, oldest edge first (the tasks_v ordering).
    const deps = task.dependencies.filter((d) => memberIds.has(d));
    const extraDeps: TaskListItem[] = [];
    for (const d of deps.slice(1)) {
      const dep = byId.get(d);
      if (dep) extraDeps.push(dep);
    }
    rows.push({ ...task, depsParentId: deps[0] ?? null, extraDeps });
  }
  return rows;
}
