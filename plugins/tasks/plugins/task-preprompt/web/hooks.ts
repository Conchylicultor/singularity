import {
  mapResource,
  useResource,
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
  const result = useResource(taskPrepromptsResource);
  return mapResource(result, (byTask) =>
    taskId ? (byTask[taskId]?.prepromptId ?? null) : null,
  );
}
