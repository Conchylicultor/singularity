import { useMemo } from "react";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { taskSidePane } from "@plugins/conversations/plugins/conversation-view/plugins/side-task/web";
import { taskDetailPane } from "@plugins/tasks/plugins/task-detail/web";
import { tasksResource } from "@plugins/tasks/shared";
import type { TaskStatus } from "@plugins/tasks-core/shared";

const TASK_STATUS_DOT: Record<TaskStatus, string> = {
  new: "bg-muted-foreground/60",
  in_progress: "bg-[oklch(0.58_0.1_240)]",
  need_action: "bg-amber-500",
  attempted: "bg-[oklch(0.58_0.1_240)]",
  done: "bg-green-500",
  held: "bg-amber-500/60",
  dropped: "bg-muted-foreground/40",
  blocked: "bg-red-500/60",
};

export function TaskLinkChip({ content }: { content: string; attrs: Record<string, string> }) {
  const taskId = content.trim();
  const { data } = useResource(tasksResource);
  const { conversation } = conversationPane.useData() ?? {};
  const task = useMemo(
    () => data?.find((t) => t.id === taskId) ?? null,
    [data, taskId],
  );

  if (!taskId) return null;

  const statusClass = task ? TASK_STATUS_DOT[task.status] : "bg-muted-foreground/40";

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        if (conversation) {
          taskSidePane.open({ convId: conversation.id, taskId });
        } else {
          taskDetailPane.open({ taskId });
        }
      }}
      className="inline-flex max-w-full items-center gap-1.5 rounded bg-muted px-1.5 py-0.5 align-baseline text-xs text-primary hover:bg-muted/80 hover:underline"
      title={task ? `${task.title} · ${taskId}` : taskId}
    >
      <span className={`inline-block size-1.5 shrink-0 rounded-full ${statusClass}`} />
      <span className="truncate">{task?.title ?? <span className="font-mono">{taskId}</span>}</span>
    </button>
  );
}
