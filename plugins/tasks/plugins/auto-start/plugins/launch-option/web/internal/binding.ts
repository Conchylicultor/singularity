import { useCallback } from "react";
import { mapRow } from "@plugins/network/plugins/live/web";
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

  // An absent row is "not armed"; loading / error pass through.
  return mapRow(autoStart, (row) => ({
    value: row?.autoStartModel ?? null,
    onChange,
  }));
}
