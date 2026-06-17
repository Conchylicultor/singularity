import { useState } from "react";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { StatusIcon } from "@plugins/tasks/plugins/task-status/web";
import { RelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import { tasksResource } from "@plugins/tasks/core";
import type { TaskViewProps } from "@plugins/tasks/plugins/task-list/web";
import type { TaskStatus } from "@plugins/tasks/plugins/tasks-core/core";
import { Row } from "@plugins/primitives/plugins/css/plugins/row/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";

function isTerminal(status: TaskStatus): boolean {
  return status === "done" || status === "dropped";
}

export function TasksRecentView({ selectedId, onSelect }: TaskViewProps) {
  const result = useResource(tasksResource);
  const [hideTerminal, setHideTerminal] = useState(true);

  if (result.pending) return <Loading variant="rows" />;

  const sorted = [...result.data]
    .filter((t) => !hideTerminal || !isTerminal(t.status))
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-sm px-sm pb-xs">
        <Text as="label" variant="caption" tone="muted" className="flex items-center gap-xs">
          <input
            type="checkbox"
            checked={hideTerminal}
            onChange={(e) => setHideTerminal(e.target.checked)}
            className="size-3"
          />
          Hide done/dropped
        </Text>
      </div>
      <Stack gap="2xs">
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
      </Stack>
    </div>
  );
}
