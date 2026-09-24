import { useMemo } from "react";
import {
  mapResource,
  usePointResources,
  type ResourceResult,
} from "@plugins/primitives/plugins/live-state/web";
import { taskPrepromptsResource } from "../shared/schemas";

/**
 * The task's selected preprompt id. Settled `null` means none is selected (or
 * there is no task); "not loaded yet" stays the pending arm, so it can never
 * read as "None".
 */
export function useTaskPreprompt(
  taskId: string | null | undefined,
): ResourceResult<string | null> {
  // `usePointResources` rather than `usePointResource`: this hook's signature is
  // nullish-tolerant and a hook cannot be called conditionally. An empty id set
  // encodes to `{ ids: "" }`, which the server's point loader short-circuits with
  // no query at all.
  const ids = useMemo(() => (taskId ? [taskId] : []), [taskId]);
  const result = usePointResources(taskPrepromptsResource, ids);
  return mapResource(result, (rows) => rows[0]?.prepromptId ?? null);
}
