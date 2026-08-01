import { useMemo } from "react";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import {
  tasksResource,
  TaskGraph as TaskGraphValue,
  type TaskListItem,
} from "@plugins/tasks/plugins/tasks-core/core";

export interface TaskClosure {
  /** The task's dependency closure, including the task itself. */
  closure: readonly TaskListItem[];
  /** Every task — the graph reads folder membership off the full list. */
  allTasks: readonly TaskListItem[];
}

/**
 * The task's dependency closure, or `null` while the task list is still
 * loading — NOT an empty closure, which is a task with no edges and means
 * something else entirely (it decides whether the section is painted at all).
 */
export function useTaskClosure(taskId: string): TaskClosure | null {
  const result = useResource(tasksResource);
  return useMemo((): TaskClosure | null => {
    if (result.pending) return null;
    const allTasks = result.data;
    const byId = new Map(allTasks.map((t) => [t.id, t]));
    const root = byId.get(taskId);
    // closure() excludes the queried id; re-include the root so it renders.
    const ids = TaskGraphValue.from(allTasks)
      .closure(taskId, { includeGroups: true })
      .map((n) => n.id);
    const closure = [...(root ? [taskId] : []), ...ids]
      .map((id) => byId.get(id))
      .filter((t): t is TaskListItem => !!t);
    return { closure, allTasks };
  }, [taskId, result]);
}

/**
 * Section gate: a graph of one node is not a graph, and neither is one we
 * haven't loaded yet. Declared as `useAvailable` rather than a `return null` in
 * the body — a section with nothing to show must paint no card at all.
 */
export function useTaskGraphAvailable({ taskId }: { taskId: string }): boolean {
  const graph = useTaskClosure(taskId);
  return graph !== null && graph.closure.length > 1;
}
