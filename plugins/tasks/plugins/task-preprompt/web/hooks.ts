import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { taskPrepromptsResource } from "../shared/schemas";

export function useTaskPreprompt(taskId: string | null | undefined): string | null {
  const result = useResource(taskPrepromptsResource);
  if (!taskId) return null;
  if (result.pending) return null;
  return result.data[taskId]?.prepromptId ?? null;
}
