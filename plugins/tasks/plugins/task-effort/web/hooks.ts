import {
  mapResource,
  useResource,
  type ResourceResult,
} from "@plugins/primitives/plugins/live-state/web";
import type { EffortLevel } from "@plugins/conversations/plugins/effort-provider/core";
import { taskEffortsResource } from "../shared/schemas";

/**
 * The task's thinking mode. Settled `null` means none is set (or there is no
 * task); "not loaded yet" stays the pending arm, so it can never read as unset.
 */
export function useTaskEffort(
  taskId: string | null | undefined,
): ResourceResult<EffortLevel | null> {
  const result = useResource(taskEffortsResource);
  return mapResource(result, (byTask) =>
    taskId ? (byTask[taskId]?.level ?? null) : null,
  );
}
