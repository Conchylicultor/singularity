import { useCallback, useMemo } from "react";
import {
  useResource,
  type ResourceResult,
} from "@plugins/primitives/plugins/live-state/web";
import {
  attemptsResource,
  tasksResource,
  type AttemptWithConversations,
  type ConversationSummary,
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

/**
 * Every run a dispatched card's task has produced, oldest first.
 *
 * A TODO card links to exactly ONE task, and that task may be worked several
 * times — `createConversation` with a `taskId` and no `attemptId` mints a new
 * attempt, which is what the panel's "Dispatch another agent" does. So "the
 * card's runs" is the task's conversations across every attempt, in the order
 * they were started.
 *
 * Joined off the already boot-critical `attempts` resource rather than stored
 * anywhere: nothing about a run is written onto the card, so the list is right
 * after a reload and follows each run's status live. The same read
 * `page/prompt/block`'s chips make.
 *
 * The card's two surfaces both read it — the foot renders all of them as chips,
 * the dispatch panel takes the newest as its "open the run" row — so they cannot
 * disagree about which runs the card has, or about their order.
 *
 * ## It hands back the STATE, not a list
 *
 * "Still loading" and "this card has no runs" are different answers, and a hook
 * that returned `[]` for both would hand every caller the second one during the
 * load window — a card that has an agent running on it, rendering for a beat as
 * a card that has none. So the resource result comes back whole and each caller
 * narrows it (`live-state/no-pending-data-collapse`).
 *
 * Both callers then render NOTHING while pending rather than a placeholder,
 * which is a different decision and theirs to make: a spinner at the foot of
 * every TODO card on a page would be noise. That is the same call
 * {@link useTodoTaskState} makes one hook up.
 *
 * The join runs as a `select`, so a card re-renders when ITS OWN runs change
 * rather than on every push to the global attempts list.
 */
export function useTodoTaskConversations(
  taskId: string,
): ResourceResult<readonly ConversationSummary[]> {
  const select = useCallback(
    (attempts: readonly AttemptWithConversations[]) =>
      attempts
        .filter((attempt) => attempt.taskId === taskId)
        .flatMap((attempt) => attempt.conversations)
        .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt)),
    [taskId],
  );
  return useResource(attemptsResource, undefined, { select });
}
