import { MODEL_REGISTRY, normalizeModel } from "@plugins/conversations/plugins/model-provider/core";
import { Badge } from "@plugins/primitives/plugins/badge/web";
import type { ItemActionProps } from "@plugins/primitives/plugins/data-view/web";
import type { TaskListItem } from "@plugins/tasks/core";
import { useTaskAutoStart } from "../hooks";
import { setAutoStart } from "@plugins/tasks/web";

export function QueuedChipAction({ row }: ItemActionProps<TaskListItem>) {
  const taskId = row.id;
  const autoStart = useTaskAutoStart(taskId);
  const queuedModel = autoStart?.autoStartModel ?? null;

  if (!queuedModel) return null;

  const label = MODEL_REGISTRY[normalizeModel(queuedModel)].label;
  return (
    <Badge
      as="button"
      variant="warning"
      size="sm"
      // eslint-disable-next-line spacing/no-adhoc-spacing -- ml-1 one-off inline offset of the chip from its preceding label; no parent gap to lift into
      className="ml-1 shrink-0 hover:bg-warning/20"
      title="Auto-start when parent is done — click to cancel"
      aria-label={`Cancel auto-start (${label})`}
      onClick={(e: React.MouseEvent) => {
        e.stopPropagation();
        void setAutoStart(taskId, "none");
      }}
    >
      Queued · {label}
    </Badge>
  );
}
