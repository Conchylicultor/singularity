import type { Conversation, TaskListItem } from "@plugins/tasks/plugins/tasks-core/core";

export type AttemptGroup = Conversation[]; // [root, ...forks]

export interface AutoGroup {
  clusterKey: string;
  title: string;
  taskIds: string[];
  attemptGroups: AttemptGroup[];
  rootConvIds: string[];
}

export interface AutoGroupsResult {
  autoGroups: AutoGroup[];
  trulyUngrouped: AttemptGroup[];
}

// The conversations meta-task. Only the server barrel exports
// `CONVERSATIONS_META_TASK_ID`, so the web keeps its own literal — carried over
// verbatim from the classic tab's `use-task-auto-groups.ts`.
const META_TASK_ID = "task-meta-conversations";

/**
 * Task auto-groups: cluster the ungrouped attempt-groups by the connected
 * components of the task dependency graph (union-find over `dependencies` in
 * both directions), keeping only clusters that hold ≥2 attempt-groups. Ported
 * verbatim from the classic tab's `useTaskAutoGroups` — same clusterKey, same
 * `" · "` title, same solo/passthrough fallout — with the `useMemo` dropped so
 * it can be called from inside {@link useGroupedRows}' own memo (a hook cannot).
 */
export function computeAutoGroups(
  ungroupedAttemptGroups: AttemptGroup[],
  tasks: TaskListItem[],
): AutoGroupsResult {
  const taskById = new Map<string, TaskListItem>();
  const reverseDeps = new Map<string, string[]>();
  for (const task of tasks) {
    taskById.set(task.id, task);
    for (const depId of task.dependencies) {
      const arr = reverseDeps.get(depId) ?? [];
      arr.push(task.id);
      reverseDeps.set(depId, arr);
    }
  }

  const activeTaskIds = new Set<string>();
  const taskIdToAttemptGroups = new Map<string, AttemptGroup[]>();
  const passthrough: AttemptGroup[] = []; // meta-task or unknown task

  for (const ag of ungroupedAttemptGroups) {
    const root = ag[0];
    if (!root) continue;
    const tid = root.taskId;
    if (tid === META_TASK_ID || !taskById.has(tid)) {
      passthrough.push(ag);
      continue;
    }
    activeTaskIds.add(tid);
    const list = taskIdToAttemptGroups.get(tid) ?? [];
    list.push(ag);
    taskIdToAttemptGroups.set(tid, list);
  }

  // Union-Find with path compression
  const parent = new Map<string, string>();
  for (const tid of activeTaskIds) parent.set(tid, tid);

  function find(x: string): string {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root)!;
    let cur = x;
    while (cur !== root) {
      const next = parent.get(cur)!;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  }

  function union(a: string, b: string) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }

  for (const tid of activeTaskIds) {
    const task = taskById.get(tid)!;
    for (const depId of task.dependencies) {
      if (activeTaskIds.has(depId)) union(tid, depId);
    }
    for (const dependentId of reverseDeps.get(tid) ?? []) {
      if (activeTaskIds.has(dependentId)) union(tid, dependentId);
    }
  }

  // Bucket by cluster root
  const clusterMap = new Map<string, { taskIds: string[]; attemptGroups: AttemptGroup[] }>();
  for (const tid of activeTaskIds) {
    const root = find(tid);
    if (!clusterMap.has(root)) clusterMap.set(root, { taskIds: [], attemptGroups: [] });
    const cluster = clusterMap.get(root)!;
    cluster.taskIds.push(tid);
    for (const ag of taskIdToAttemptGroups.get(tid) ?? []) {
      cluster.attemptGroups.push(ag);
    }
  }

  const autoGroups: AutoGroup[] = [];
  const solos: AttemptGroup[] = [];

  for (const cluster of clusterMap.values()) {
    if (cluster.attemptGroups.length < 2) {
      for (const ag of cluster.attemptGroups) solos.push(ag);
      continue;
    }

    // Sort task IDs by title then id for a stable, readable label
    const sortedTaskIds = [...cluster.taskIds].sort((a, b) => {
      const ta = taskById.get(a)?.title ?? "";
      const tb = taskById.get(b)?.title ?? "";
      return ta.localeCompare(tb) || a.localeCompare(b);
    });

    const titleParts = sortedTaskIds
      .slice(0, 2)
      .map((tid) => taskById.get(tid)?.title.trim() || "Untitled");
    let title = titleParts.join(" · ");
    if (sortedTaskIds.length > 2) title += " …";

    const clusterKey = [...cluster.taskIds].sort().join(":");
    const rootConvIds = cluster.attemptGroups.map((ag) => ag[0]!.id);

    autoGroups.push({
      clusterKey,
      title,
      taskIds: cluster.taskIds,
      attemptGroups: cluster.attemptGroups,
      rootConvIds,
    });
  }

  return { autoGroups, trulyUngrouped: [...passthrough, ...solos] };
}
