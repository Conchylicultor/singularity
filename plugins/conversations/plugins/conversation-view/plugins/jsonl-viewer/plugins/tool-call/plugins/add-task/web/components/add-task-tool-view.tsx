import { useMemo } from "react";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { taskDetailPane } from "@plugins/tasks/plugins/task-detail/web";
import { tasksResource } from "@plugins/tasks/plugins/tasks-core/core";
import { StatusIcon } from "@plugins/tasks/plugins/task-status/web";
import type { ToolRendererProps } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/core";
import { ToolCallCard } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/web";
import { MODEL_REGISTRY, normalizeModel } from "@plugins/conversations/plugins/model-provider/core";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { LinkChip } from "@plugins/primitives/plugins/css/plugins/link-chip/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Frame } from "@plugins/primitives/plugins/css/plugins/frame/web";

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
  const openPane = useOpenPane();
  const task = useMemo(
    () => (tasksResult.pending || !taskId) ? null : (tasksResult.data.find((t) => t.id === taskId) ?? null),
    [tasksResult, taskId],
  );

  const openTask = (e: React.MouseEvent) => {
    if (!taskId) return;
    e.stopPropagation();
    openPane(taskDetailPane, { taskId }, { mode: "push" });
  };

  const summary = (
    <Frame
      gap="sm"
      content={input.title}
      trailing={
        autostart ? (
          <Badge variant="success">
            auto-launch {MODEL_REGISTRY[normalizeModel(autostart)].label}
          </Badge>
        ) : (
          <Badge variant="warning">
            no auto-launch
          </Badge>
        )
      }
    />
  );

  return (
    <ToolCallCard event={event} summary={summary} defaultOpen>
      {/* eslint-disable-next-line spacing/no-adhoc-spacing -- mt-2 offsets the body from the ToolCallCard header inside its collapsible region; not a Stack-owned gap */}
      <Stack gap="sm" className="mt-2">
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
      </Stack>
    </ToolCallCard>
  );
}
