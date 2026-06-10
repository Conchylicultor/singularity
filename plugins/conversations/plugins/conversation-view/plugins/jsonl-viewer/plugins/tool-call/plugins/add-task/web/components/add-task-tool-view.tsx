import { useMemo } from "react";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { taskSidePane } from "@plugins/conversations/plugins/conversation-view/plugins/side-task/web";
import { tasksResource } from "@plugins/tasks/core";
import { StatusIcon } from "@plugins/tasks/plugins/task-status/web";
import type { ToolRendererProps } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/core";
import { ToolCallCard } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/web";
import { MODEL_REGISTRY, normalizeModel } from "@plugins/conversations/plugins/model-provider/core";
import { Badge } from "@plugins/primitives/plugins/badge/web";
import { LinkChip } from "@plugins/primitives/plugins/link-chip/web";
import { Text } from "@plugins/primitives/plugins/text/web";

type AddTaskInput = {
  title: string;
  description?: string;
  relation?: "followup" | "prerequisite" | "independent";
  target?: string;
  autostart: string | null;
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
  } catch (err) {
    if (!(err instanceof SyntaxError)) throw err;
    return null;
  }
}

export function AddTaskToolView({ event }: ToolRendererProps) {
  const input = event.input as AddTaskInput;
  const result = parseResult(event);
  const taskId = result?.task_id;
  const autostart = input.autostart ?? result?.autostart ?? null;

  const tasksResult = useResource(tasksResource);
  const { convId } = conversationPane.useParams();
  const openPane = useOpenPane();
  const task = useMemo(
    () => (tasksResult.pending || !taskId) ? null : (tasksResult.data.find((t) => t.id === taskId) ?? null),
    [tasksResult, taskId],
  );

  const openTask = (e: React.MouseEvent) => {
    if (!taskId) return;
    e.stopPropagation();
    openPane(taskSidePane, { taskId }, { mode: "push", input: { convId } });
  };

  const summary = (
    <span className="flex min-w-0 items-center gap-2">
      <span className="min-w-0 truncate">{input.title}</span>
      {autostart ? (
        <Badge variant="success" size="sm" className="shrink-0">
          auto-launch {MODEL_REGISTRY[normalizeModel(autostart)].label}
        </Badge>
      ) : (
        <Badge variant="warning" size="sm" className="shrink-0">
          no auto-launch
        </Badge>
      )}
    </span>
  );

  return (
    <ToolCallCard event={event} summary={summary} defaultOpen>
      <div className="mt-2 space-y-2">
        {input.description && (
          <Text as="p" variant="caption" className="text-muted-foreground whitespace-pre-wrap">
            {input.description}
          </Text>
        )}
        {taskId && (
          <LinkChip
            onClick={openTask}
            leading={task ? <StatusIcon status={task.status} /> : undefined}
            title={task ? `${task.title} · ${taskId}` : taskId}
          >
            {task?.title ?? <span className="font-mono">{taskId}</span>}
          </LinkChip>
        )}
        {event.result?.isError && (
          <Text as="p" variant="caption" className="text-destructive">{event.result.content}</Text>
        )}
      </div>
    </ToolCallCard>
  );
}
