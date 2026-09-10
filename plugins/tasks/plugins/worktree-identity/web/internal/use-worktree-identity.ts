import { useCallback, useMemo } from "react";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { namespaceFromHost } from "@plugins/infra/plugins/namespace/core";
import {
  attemptsResource,
  tasksResource,
  type AttemptWithConversations,
  type TaskListItem,
} from "@plugins/tasks/plugins/tasks-core/core";
import type { HealthInfo } from "@plugins/shell/plugins/health-report/web";
import {
  identityInfo,
  linkedTaskIdOf,
  placeOf,
  type LinkedTask,
  type WorktreePlace,
} from "./identity";

/**
 * Where this page is served from. Read inside a hook rather than at module
 * scope, which would make the module unimportable without a DOM. The host
 * never changes for the life of the page, hence the empty deps.
 */
export function useWorktreePlace(): WorktreePlace {
  return useMemo(() => placeOf(namespaceFromHost(window.location.host)), []);
}

/**
 * The task this page's checkout is working on: the attempt whose worktree path
 * ends in the checkout, then that attempt's task.
 *
 * Both reads are `select`s over resources that are already resident (boot
 * critical), so this re-renders when THIS checkout's link changes, not on every
 * push to the global lists. `gate` keeps the pending → settled flip reliable,
 * since `pending` is an answer of its own here.
 */
export function useLinkedTask(place: WorktreePlace): LinkedTask {
  const checkout = place.kind === "worktree" ? place.checkout : null;

  const selectTaskId = useCallback(
    (attempts: readonly AttemptWithConversations[]) =>
      checkout === null ? null : linkedTaskIdOf(attempts, checkout),
    [checkout],
  );
  const attempt = useResource(attemptsResource, undefined, {
    select: selectTaskId,
    gate: true,
  });

  const taskId = attempt.pending ? null : attempt.data;
  const selectTitle = useCallback(
    (tasks: readonly TaskListItem[]) =>
      taskId === null
        ? null
        : (tasks.find((t) => t.id === taskId)?.title ?? null),
    [taskId],
  );
  const task = useResource(tasksResource, undefined, {
    select: selectTitle,
    gate: true,
  });

  if (checkout === null) return { kind: "none" };
  if (attempt.pending) return { kind: "pending" };
  if (attempt.data === null) return { kind: "none" };
  if (task.pending) return { kind: "pending" };
  if (task.data === null) return { kind: "none" };
  return { kind: "linked", taskId: attempt.data, title: task.data };
}

/** The health report's worktree row: `{ title, summary }` for this page. */
export function useWorktreeIdentity(): HealthInfo {
  const place = useWorktreePlace();
  return identityInfo(place, useLinkedTask(place));
}
