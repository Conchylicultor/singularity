import { useMemo } from "react";
import type { Conversation, Task } from "@plugins/tasks-core/shared";

export type AttemptGroup = Conversation[]; // [root, ...forks]

export interface AutoGroup {
  clusterKey: string;
  title: string;
  taskIds: string[];
  attemptGroups: AttemptGroup[];
  rootConvIds: string[];
}

export interface UseTaskAutoGroupsResult {
  autoGroups: AutoGroup[];
  trulyUngrouped: AttemptGroup[];
}

const META_TASK_ID = "task-meta-conversations";

export function useTaskAutoGroups(
  ungroupedAttemptGroups: AttemptGroup[],
  tasks: Task[],
): UseTaskAutoGroupsResult {
  return useMemo(() => {
    const taskById = new Map<string, Task>();
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
        .map((tid) => taskById.get(tid)?.title?.trim() || "Untitled");
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
  }, [ungroupedAttemptGroups, tasks]);
}
