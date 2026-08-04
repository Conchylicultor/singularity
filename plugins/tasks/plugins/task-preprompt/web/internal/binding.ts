import { useCallback } from "react";
import { toast } from "@plugins/shell/plugins/notifications/web";
import type { LaunchBinding } from "@plugins/tasks/plugins/launch-options/web";
import { useTaskPreprompt } from "../hooks";
import { setTaskPrepromptRemote } from "./api";

/** Binds the control to an existing task's `tasks_ext_preprompt` row. */
export function useTaskPrepromptBinding(
  taskId: string,
): LaunchBinding<string | null> {
  const value = useTaskPreprompt(taskId);

  const onChange = useCallback(
    (prepromptId: string | null) => {
      setTaskPrepromptRemote(taskId, prepromptId).catch((err: unknown) => {
        toast({
          type: "task",
          title: "Failed to set preprompt",
          description: err instanceof Error ? err.message : String(err),
          variant: "error",
        });
      });
    },
    [taskId],
  );

  return { value, onChange };
}
