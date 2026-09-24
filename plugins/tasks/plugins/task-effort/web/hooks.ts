import { useMemo } from "react";
import {
  mapResource,
  usePointResources,
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
  // `usePointResources` rather than `usePointResource`: this hook's signature is
  // nullish-tolerant and a hook cannot be called conditionally. An empty id set
  // encodes to `{ ids: "" }`, which the server's point loader short-circuits with
  // no query at all.
  const ids = useMemo(() => (taskId ? [taskId] : []), [taskId]);
  const result = usePointResources(taskEffortsResource, ids);
  return mapResource(result, (rows) => rows[0]?.level ?? null);
}
