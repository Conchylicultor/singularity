import { useCallback } from "react";
import { useResource, ResourceView } from "@plugins/primitives/plugins/live-state/web";
import { useSubtreeExpandAll } from "@plugins/primitives/plugins/tree/web";
import { ExpandAllButton } from "@plugins/primitives/plugins/collapsible/web";
import type { ItemActionProps } from "@plugins/primitives/plugins/data-view/web";
import { tasksResource, type TaskListItem } from "@plugins/tasks/core";
import { patchTask } from "@plugins/tasks/web";

function ExpandCollapseAllActionInner({
  rows,
  taskId,
  hasChildren,
}: {
  rows: readonly TaskListItem[];
  taskId: string;
  hasChildren: boolean;
}) {
  // The tree primitive's ExpandableRow speaks `parentId`; project the tasks'
  // folder hierarchy onto it at this boundary.
  const mappedRows = rows.map((t) => ({ ...t, parentId: t.folderId }));
  const patch = useCallback(
    (id: string, expanded: boolean) => patchTask(id, { expanded }),
    [],
  );
  const { willCollapse, toggle } = useSubtreeExpandAll(mappedRows, taskId, patch);

  if (!hasChildren) return null;

  return (
    <ExpandAllButton allExpanded={!willCollapse} onToggle={toggle} />
  );
}

export function ExpandCollapseAllAction({
  row,
  hasChildren,
}: ItemActionProps<TaskListItem>) {
  const taskId = row.id;
  const result = useResource(tasksResource);
  // Return null while pending (no flicker of the button with empty rows).
  if (!hasChildren) return null;
  return (
    <ResourceView resource={result}>
      {(rows) => (
        <ExpandCollapseAllActionInner rows={rows} taskId={taskId} hasChildren={hasChildren} />
      )}
    </ResourceView>
  );
}
