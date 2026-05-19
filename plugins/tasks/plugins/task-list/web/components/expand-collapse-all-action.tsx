import { useCallback } from "react";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { useSubtreeExpandAll } from "@plugins/primitives/plugins/tree/web";
import { ExpandAllButton } from "@plugins/primitives/plugins/collapsible/web";
import { tasksResource } from "@plugins/tasks/core";
import { patchTask } from "@plugins/tasks/web";

export function ExpandCollapseAllAction({
  taskId,
  hasChildren,
}: {
  taskId: string;
  hasChildren: boolean;
}) {
  const result = useResource(tasksResource);
  const rows = result.pending ? [] : result.data;
  const patch = useCallback(
    (id: string, expanded: boolean) => patchTask(id, { expanded }),
    [],
  );
  const { willCollapse, toggle } = useSubtreeExpandAll(rows, taskId, patch);

  if (!hasChildren || result.pending) return null;

  return (
    <ExpandAllButton allExpanded={!willCollapse} onToggle={toggle} />
  );
}
