import { useCallback } from "react";
import { toast } from "@plugins/shell/plugins/notifications/web";
import type { EffortLevel } from "@plugins/conversations/plugins/effort-provider/core";
import type { LaunchBinding } from "@plugins/tasks/plugins/launch-options/web";
import { useTaskEffort } from "../hooks";
import { setTaskEffortRemote } from "./api";

/** Binds the control to an existing task's `tasks_ext_effort` row. */
export function useTaskEffortBinding(
  taskId: string,
): LaunchBinding<EffortLevel | null> {
  const value = useTaskEffort(taskId);

  const onChange = useCallback(
    (level: EffortLevel | null) => {
      setTaskEffortRemote(taskId, level).catch((err: unknown) => {
        toast({
          type: "task",
          title: "Failed to set thinking mode",
          description: err instanceof Error ? err.message : String(err),
          variant: "error",
        });
      });
    },
    [taskId],
  );

  return { value, onChange };
}
