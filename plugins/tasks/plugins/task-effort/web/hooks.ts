import { useResource } from "@plugins/primitives/plugins/live-state/web";
import type { EffortLevel } from "@plugins/conversations/plugins/effort-provider/core";
import { taskEffortsResource } from "../shared/schemas";

export function useTaskEffort(taskId: string | null | undefined): EffortLevel | null {
  const result = useResource(taskEffortsResource);
  if (!taskId) return null;
  if (result.pending) return null;
  return result.data[taskId]?.level ?? null;
}
