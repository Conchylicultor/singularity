import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { taskAutoStartResource, type TaskAutoStartRow } from "@plugins/tasks/plugins/auto-start/shared/resources";

export function useTaskAutoStart(taskId: string | null | undefined): TaskAutoStartRow | null {
  const { data } = useResource(taskAutoStartResource);
  if (!taskId) return null;
  return data.find((r) => r.parentId === taskId) ?? null;
}
