import { useMemo } from "react";
import {
  mapResource,
  useResource,
  type ResourceResult,
} from "@plugins/primitives/plugins/live-state/web";
import {
  tasksResource,
  type TaskStatus,
} from "@plugins/tasks/plugins/tasks-core/core";
import { todoTaskResource, type TodoTaskLink } from "../shared/schemas";

/**
 * The task a TODO card has been dispatched onto. Settled `null` means it has not
 * been dispatched; "not loaded yet" stays the pending arm, so a dispatched card
 * never offers "Launch" as if it were fresh. Callers that render the two the same
 * (the run chips: nothing either way) decide that themselves.
 *
 * At most one link exists per card — the extension table's primary key is the
 * block id — so the array the resource carries is read as its first element
 * rather than searched.
 */
export function useTodoTask(
  blockId: string,
): ResourceResult<TodoTaskLink | null> {
  const result = useResource(todoTaskResource, { blockId });
  return mapResource(result, (links) => links[0] ?? null);
}

/** A dispatched card's task, as the card's two surfaces need to render it. */
export interface TodoTaskState {
  taskId: string;
  title: string;
  status: TaskStatus;
}

/**
 * The linked task's LIVE title and status, joined client-side.
 *
 * The join is the whole point: the link row carries the task id and nothing
 * else, and the title and status come off the already boot-critical `tasks`
 * resource — the same one the task list renders. So a card's glyph follows the
 * task through every status change with nothing stored on the card and nothing
 * to keep in sync, which is the same read `page/prompt/block`'s chips make
 * against `attempts`.
 *
 * `null` while either side is hydrating, and `null` when the task is not in the
 * tasks resource at all. That last case is not a hole to fill: the link's
 * `task_id` FK cascades, so a deleted task takes its link row with it and both
 * reads converge on "this card has not been dispatched" — which is the truth,
 * and is what frees the card for a fresh dispatch.
 */
export function useTodoTaskState(blockId: string): TodoTaskState | null {
  const link = useTodoTask(blockId);
  const tasks = useResource(tasksResource);
  // Hydrating reads as "no task" here by design — see above.
  const taskId = link.pending ? undefined : link.data?.taskId;

  return useMemo(() => {
    if (taskId === undefined || tasks.pending) return null;
    const task = tasks.data.find((t) => t.id === taskId);
    if (!task) return null;
    return { taskId, title: task.title, status: task.status };
  }, [taskId, tasks]);
}
