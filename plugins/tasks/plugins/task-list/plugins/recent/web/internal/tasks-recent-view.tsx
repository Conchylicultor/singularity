import { useMemo, useState, useCallback } from "react";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { Placeholder } from "@plugins/primitives/plugins/placeholder/web";
import { StatusIcon } from "@plugins/tasks/plugins/task-status/web";
import { RelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import { tasksResource } from "@plugins/tasks/core";
import type { TaskViewProps } from "@plugins/tasks/plugins/task-list/web";
import type { TaskListItem, TaskStatus } from "@plugins/tasks-core/core";
import { Row } from "@plugins/primitives/plugins/row/web";
import { Text } from "@plugins/primitives/plugins/text/web";

function isTerminal(status: TaskStatus): boolean {
  return status === "done" || status === "dropped";
}

export function TasksRecentView({ selectedId, onSelect }: TaskViewProps) {
  const result = useResource(tasksResource);
  const [hideTerminal, setHideTerminal] = useState(true);

  const filterFn = useCallback(
    (t: TaskListItem) => !hideTerminal || !isTerminal(t.status),
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
        <Text as="label" variant="caption" tone="muted" className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={hideTerminal}
            onChange={(e) => setHideTerminal(e.target.checked)}
            className="size-3"
          />
          Hide done/dropped
        </Text>
      </div>
      <div className="flex flex-col gap-0.5">
        {sorted.map((task) => (
          <Row
            key={task.id}
            selected={task.id === selectedId}
            icon={<StatusIcon status={task.status} />}
            actions={<RelativeTime date={task.updatedAt} />}
            actionsAlwaysVisible
            onClick={() => onSelect(task.id)}
          >
            <span className="min-w-0 flex-1 truncate">
              {task.title || "Untitled"}
            </span>
          </Row>
        ))}
      </div>
    </div>
  );
}
