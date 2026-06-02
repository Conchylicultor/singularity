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
  // The tree primitive's ExpandableRow speaks `parentId`; project the tasks'
  // folder hierarchy onto it at this boundary.
  const rows = result.pending
    ? []
    : result.data.map((t) => ({ ...t, parentId: t.folderId }));
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
