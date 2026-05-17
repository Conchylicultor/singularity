import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { taskAutoStartResource, type TaskAutoStartRow } from "../shared/resources";

export function useTaskAutoStart(taskId: string | null | undefined): TaskAutoStartRow | null {
  const result = useResource(taskAutoStartResource);
  if (!taskId) return null;
  if (result.pending) return null;
  return result.data.find((r) => r.parentId === taskId) ?? null;
}
