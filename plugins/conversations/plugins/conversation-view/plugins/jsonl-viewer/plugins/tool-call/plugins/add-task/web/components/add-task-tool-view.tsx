import { useMemo } from "react";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { taskSidePane } from "@plugins/conversations/plugins/conversation-view/plugins/side-task/web";
import { tasksResource } from "@plugins/tasks/core";
import { StatusIcon } from "@plugins/tasks/plugins/task-status/web";
import type { ToolRendererProps } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/core";
import { ToolCallCard } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/web";

type AddTaskInput = {
  title: string;
  description?: string;
  relation?: "followup" | "prerequisite" | "independent";
  target?: string;
  autostart: "sonnet" | "opus" | null;
};

type AddTaskResult = {
  task_id: string;
  relation: string;
  group_id?: string | null;
  autostart: string | null;
};

function parseResult(event: ToolRendererProps["event"]): AddTaskResult | null {
  if (!event.result?.content) return null;
  try {
    return JSON.parse(event.result.content);
  } catch {
    return null;
  }
}

export function AddTaskToolView({ event }: ToolRendererProps) {
  const input = event.input as AddTaskInput;
  const result = parseResult(event);
  const taskId = result?.task_id;

  const tasksResult = useResource(tasksResource);
  const { conversation } = conversationPane.useData();
  const openPane = useOpenPane();
  const task = useMemo(
    () => (tasksResult.pending || !taskId) ? null : (tasksResult.data.find((t) => t.id === taskId) ?? null),
    [tasksResult, taskId],
  );

  const openTask = (e: React.MouseEvent) => {
    if (!taskId) return;
    e.stopPropagation();
    openPane(taskSidePane, { convId: conversation.id, taskId }, { mode: "push" });
  };

  return (
    <ToolCallCard event={event} summary={input.title} defaultOpen>
      <div className="mt-2 space-y-2">
        {input.description && (
          <p className="text-xs text-muted-foreground whitespace-pre-wrap">
            {input.description}
          </p>
        )}
        {taskId && (
          <button
            type="button"
            onClick={openTask}
            className="inline-flex max-w-full items-center gap-1.5 rounded bg-muted px-2 py-1 text-xs text-primary hover:bg-muted/80 hover:underline"
            title={task ? `${task.title} · ${taskId}` : taskId}
          >
            {task && <StatusIcon status={task.status} />}
            <span className="truncate">
              {task?.title ?? <span className="font-mono">{taskId}</span>}
            </span>
          </button>
        )}
        {event.result?.isError && (
          <p className="text-xs text-destructive">{event.result.content}</p>
        )}
      </div>
    </ToolCallCard>
  );
}
