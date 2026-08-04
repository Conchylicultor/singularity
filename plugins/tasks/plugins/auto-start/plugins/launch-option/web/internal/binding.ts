import { useCallback } from "react";
import {
  normalizeModel,
  type ConversationModel,
} from "@plugins/conversations/plugins/model-provider/core";
import { setAutoStart } from "@plugins/tasks/web";
import { useTaskAutoStart } from "@plugins/tasks/plugins/auto-start/web";
import type { LaunchBinding } from "@plugins/tasks/plugins/launch-options/web";

/** Binds the control to an existing task's `tasks_ext_auto_start` row. */
export function useTaskAutoStartBinding(
  taskId: string,
): LaunchBinding<ConversationModel | null> {
  const autoStart = useTaskAutoStart(taskId);

  const onChange = useCallback(
    (next: ConversationModel | null) => void setAutoStart(taskId, next ?? "none"),
    [taskId],
  );

  return {
    value:
      autoStart?.autoStartModel != null
        ? normalizeModel(autoStart.autoStartModel)
        : null,
    onChange,
  };
}
