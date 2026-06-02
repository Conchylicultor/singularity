import { useMemo } from "react";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { StatusDot } from "@plugins/primitives/plugins/status-dot/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { taskSidePane } from "@plugins/conversations/plugins/conversation-view/plugins/side-task/web";
import { taskDetailPane } from "@plugins/tasks/plugins/task-detail/web";
import { tasksResource } from "@plugins/tasks/core";
import type { TaskStatus } from "@plugins/tasks-core/core";

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
  const convId = conversationPane.useChainEntry()?.params.convId ?? null;
  const openPane = useOpenPane();
  const task = useMemo(
    () => (result.pending ? null : result.data.find((t) => t.id === taskId) ?? null),
    [result, taskId],
  );

  if (!taskId) return null;

  const statusClass = task ? TASK_STATUS_DOT[task.status] : "bg-muted-foreground/40";

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        if (convId) {
          openPane(taskSidePane, { taskId }, { mode: "push", input: { convId } });
        } else {
          openPane(taskDetailPane, { taskId }, { mode: "push" });
        }
      }}
      className="inline-flex max-w-full items-center gap-1.5 rounded bg-muted px-1.5 py-0.5 align-baseline text-xs text-primary hover:bg-muted/80 hover:underline"
      title={task ? `${task.title} · ${taskId}` : taskId}
    >
      <StatusDot colorClass={statusClass} />
      <span className="truncate">{task?.title ?? <span className="font-mono">{taskId}</span>}</span>
    </button>
  );
}
