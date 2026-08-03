import { useCallback } from "react";
import { normalizeModel } from "@plugins/conversations/plugins/model-provider/core";
import { ModelSelect } from "@plugins/conversations/plugins/model-provider/web";
import { setAutoStart, type AutoStartModel } from "@plugins/tasks/web";
import { useTaskAutoStart } from "../hooks";

/**
 * Picks the model this task auto-starts with (or `Off`). One select — it rides
 * the Prompt card's launch-option row, so the label is the row's, not ours.
 */
export function TaskAutoStartControl({ taskId }: { taskId: string }) {
  const autoStart = useTaskAutoStart(taskId);

  const onChange = useCallback(
    (model: AutoStartModel) => setAutoStart(taskId, model),
    [taskId],
  );

  return (
    <ModelSelect
      value={autoStart?.autoStartModel != null ? normalizeModel(autoStart.autoStartModel) : null}
      onChange={(m) => void onChange(m ?? "none")}
      ariaLabel="Auto-start model"
    />
  );
}
