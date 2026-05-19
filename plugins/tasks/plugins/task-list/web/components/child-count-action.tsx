import { useMemo } from "react";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { tasksResource } from "@plugins/tasks/core";

export function ChildCountAction({
  taskId,
  hasChildren,
}: {
  taskId: string;
  hasChildren: boolean;
}) {
  const result = useResource(tasksResource);
  const count = useMemo(() => {
    if (result.pending || !hasChildren) return 0;
    return result.data.filter((t) => t.parentId === taskId).length;
  }, [result, taskId, hasChildren]);

  if (!hasChildren) return null;

  return (
    <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
      {count}
    </span>
  );
}
