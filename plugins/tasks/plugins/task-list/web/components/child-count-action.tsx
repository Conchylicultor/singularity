import { useMemo } from "react";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import type { ItemActionProps } from "@plugins/primitives/plugins/data-view/web";
import { type TaskListItem } from "@plugins/tasks/core";
import { tasksResource } from "@plugins/tasks/plugins/tasks-core/core";

export function ChildCountAction({
  row,
  hasChildren,
}: ItemActionProps<TaskListItem>) {
  const taskId = row.id;
  const result = useResource(tasksResource);
  const count = useMemo(() => {
    if (result.pending || !hasChildren) return 0;
    return result.data.filter((t) => t.folderId === taskId).length;
  }, [result, taskId, hasChildren]);

  if (!hasChildren) return null;

  return (
    // eslint-disable-next-line layout/no-adhoc-layout -- rigid count leaf inside the data-view item-actions flex cluster (owned by Row); must never shrink
    <span className="shrink-0 text-3xs tabular-nums text-muted-foreground">
      {count}
    </span>
  );
}
