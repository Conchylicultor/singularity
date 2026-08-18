import {
  useResource,
  matchResource,
} from "@plugins/primitives/plugins/live-state/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { StatusDot } from "@plugins/primitives/plugins/css/plugins/status-dot/web";
import { LinkChip } from "@plugins/primitives/plugins/css/plugins/link-chip/web";
import { taskDetailPane } from "@plugins/tasks/plugins/task-detail/web";
import { tasksResource } from "@plugins/tasks/plugins/tasks-core/core";
import { STATUS_META } from "@plugins/tasks/plugins/task-status/web";

export function TaskLinkChip({
  content,
}: {
  content: string;
  attrs: Record<string, string>;
}) {
  const taskId = content.trim();
  const result = useResource(tasksResource);
  const openPane = useOpenPane();

  if (!taskId) return null;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    openPane(taskDetailPane, { taskId }, { mode: "push" });
  };

  // While pending, render the degraded raw-id chip so it never disappears.
  return matchResource(result, {
    pending: () => (
      <LinkChip
        onClick={handleClick}
        title={taskId}
        leading={<StatusDot colorClass="bg-muted-foreground/40" />}
      >
        <span className="font-mono">{taskId}</span>
      </LinkChip>
    ),
    ready: (data) => {
      const task = data.find((t) => t.id === taskId) ?? null;
      // The dot colour comes from the one status-display table (task-status), so
      // this chip can never drift from the badge the task list shows.
      const statusClass = task
        ? STATUS_META[task.status].dotClass
        : "bg-muted-foreground/40";
      return (
        <LinkChip
          onClick={handleClick}
          title={task ? `${task.title} · ${taskId}` : taskId}
          leading={<StatusDot colorClass={statusClass} />}
        >
          {task?.title ?? <span className="font-mono">{taskId}</span>}
        </LinkChip>
      );
    },
  });
}
