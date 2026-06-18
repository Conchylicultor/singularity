import { useResource, matchResource } from "@plugins/primitives/plugins/live-state/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { StatusDot } from "@plugins/primitives/plugins/css/plugins/status-dot/web";
import { LinkChip } from "@plugins/primitives/plugins/css/plugins/link-chip/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { taskDetailPane } from "@plugins/tasks/plugins/task-detail/web";
import { tasksResource } from "@plugins/tasks/core";
import type { TaskStatus } from "@plugins/tasks/plugins/tasks-core/core";

const TASK_STATUS_DOT: Record<TaskStatus, string> = {
  new: "bg-muted-foreground/60",
  in_progress: "bg-info",
  need_action: "bg-warning",
  attempted: "bg-info",
  done: "bg-success",
  held: "bg-warning/60",
  dropped: "bg-muted-foreground/40",
  blocked: "bg-destructive/60",
};

export function TaskLinkChip({ content }: { content: string; attrs: Record<string, string> }) {
  const taskId = content.trim();
  const result = useResource(tasksResource);
  const convId = conversationPane.useRouteEntry()?.params.convId ?? null;
  const openPane = useOpenPane();

  if (!taskId) return null;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (convId) {
      openPane(taskDetailPane, { taskId }, { mode: "push" });
    } else {
      openPane(taskDetailPane, { taskId }, { mode: "push", input: { focused: "true" } });
    }
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
      const statusClass = task ? TASK_STATUS_DOT[task.status] : "bg-muted-foreground/40";
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
