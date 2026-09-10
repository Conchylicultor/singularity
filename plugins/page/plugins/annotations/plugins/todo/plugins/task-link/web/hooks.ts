import { useMemo } from "react";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import {
  tasksResource,
  type TaskStatus,
} from "@plugins/tasks/plugins/tasks-core/core";
import { todoTaskResource, type TodoTaskLink } from "../shared/schemas";

/**
 * The task a TODO card has been dispatched onto, or `null` when it has not been.
 *
 * `null` also covers "still hydrating", and the caller renders the two the same
 * way — as nothing to show. A card whose link has not loaded and a card nobody
 * has dispatched both have no task, and a spinner in place of the card's glyph
 * would be noise on every card of the page. The consequence is that a
 * freshly-opened page's TODO glyph settles a beat after it paints — the same call
 * `useAgentNotesAuthors` and `useBlockPromptTasks` make.
 *
 * At most one link exists per card — the extension table's primary key is the
 * block id — so the array the resource carries is read as its first element
 * rather than searched.
 */
export function useTodoTask(blockId: string): TodoTaskLink | null {
  const result = useResource(todoTaskResource, { blockId });
  if (result.pending) return null;
  return result.data[0] ?? null;
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
  const taskId = link?.taskId;

  return useMemo(() => {
    if (taskId === undefined || tasks.pending) return null;
    const task = tasks.data.find((t) => t.id === taskId);
    if (!task) return null;
    return { taskId, title: task.title, status: task.status };
  }, [taskId, tasks]);
}
