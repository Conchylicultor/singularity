import { useMemo } from "react";
import {
  mapResource,
  usePointResources,
  type ResourceResult,
} from "@plugins/primitives/plugins/live-state/web";
import {
  taskAutoStartResource,
  type TaskAutoStartRow,
} from "../shared/resources";

/**
 * The task's auto-start row. Settled `null` means the task has no row (not
 * armed); "not loaded yet" stays the pending arm, so an armed task can never
 * read as unarmed during the load window.
 */
export function useTaskAutoStart(
  taskId: string | null | undefined,
): ResourceResult<TaskAutoStartRow | null> {
  // `usePointResources` rather than `usePointResource`: this hook's signature is
  // nullish-tolerant and a hook cannot be called conditionally. An empty id set
  // encodes to `{ ids: "" }`, which the server's point loader short-circuits with
  // no query at all — the same free "nothing to ask about" arm the conversation
  // categories avatar uses.
  const ids = useMemo(() => (taskId ? [taskId] : []), [taskId]);
  const result = usePointResources(taskAutoStartResource, ids);
  return mapResource(result, (rows) => rows[0] ?? null);
}
