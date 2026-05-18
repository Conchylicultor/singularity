import { useMemo, useState, useCallback } from "react";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { Placeholder } from "@plugins/primitives/plugins/placeholder/web";
import { StatusIcon } from "@plugins/tasks/plugins/task-status/web";
import { RelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import { tasksResource } from "@plugins/tasks/core";
import type { TaskViewProps } from "@plugins/tasks/plugins/task-list/web";
import type { Task, TaskStatus } from "@plugins/tasks-core/core";
import { cn } from "@/lib/utils";

function isTerminal(status: TaskStatus): boolean {
  return status === "done" || status === "dropped";
}

export function TasksRecentView({ selectedId, onSelect }: TaskViewProps) {
  const result = useResource(tasksResource);
  const [hideTerminal, setHideTerminal] = useState(true);

  const filterFn = useCallback(
    (t: Task) => !hideTerminal || !isTerminal(t.status),
    [hideTerminal],
  );

  const sorted = useMemo(() => {
    if (result.pending) return [];
    return [...result.data]
      .filter(filterFn)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }, [result, filterFn]);

  if (result.pending) return <Placeholder>Loading...</Placeholder>;

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 px-2 pb-1">
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={hideTerminal}
            onChange={(e) => setHideTerminal(e.target.checked)}
            className="size-3"
          />
          Hide done/dropped
        </label>
      </div>
      <div className="flex flex-col gap-0.5">
        {sorted.map((task) => (
          <button
            key={task.id}
            type="button"
            onClick={() => onSelect(task.id)}
            className={cn(
              "flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm",
              task.id === selectedId
                ? "bg-accent text-foreground"
                : "text-foreground hover:bg-accent/50",
            )}
          >
            <StatusIcon status={task.status} />
            <span className="min-w-0 flex-1 truncate">
              {task.title || "Untitled"}
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">
              <RelativeTime date={task.updatedAt} />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
