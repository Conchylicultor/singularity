import { useCallback } from "react";
import type { ModelChoice } from "@plugins/conversations/plugins/model-provider/core";
import { setAutoStart } from "@plugins/tasks/web";
import { useTaskAutoStart } from "@plugins/tasks/plugins/auto-start/web";
import type { LaunchBinding } from "@plugins/tasks/plugins/launch-options/web";

/** Binds the control to an existing task's `tasks_ext_auto_start` row. */
export function useTaskAutoStartBinding(
  taskId: string,
): LaunchBinding<ModelChoice | null> {
  const autoStart = useTaskAutoStart(taskId);

  const onChange = useCallback(
    (next: ModelChoice | null) => void setAutoStart(taskId, next ?? "none"),
    [taskId],
  );

  if (autoStart.pending) return { pending: true };
  return {
    pending: false,
    value: autoStart.data?.autoStartModel ?? null,
    onChange,
  };
}
