import type { ToolRendererProps } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/core";
import { ToolCallCard } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/web";

type TaskGetInput = {
  taskId?: string;
  id?: string;
};

export function TaskGetToolView({ event }: ToolRendererProps) {
  const input = event.input as TaskGetInput;
  const taskId = input.taskId ?? input.id;

  const summary = taskId ? (
    <span className="font-mono text-[11px]">{taskId}</span>
  ) : undefined;

  return (
    <ToolCallCard event={event} summary={summary} defaultOpen={false}>
      {event.result && !event.result.isError && (
        <pre className="mt-2 max-h-[200px] overflow-auto rounded bg-muted/50 p-2 text-[11px] text-muted-foreground">
          {event.result.content}
        </pre>
      )}
      {event.result?.isError && (
        <p className="mt-2 text-xs text-destructive">{event.result.content}</p>
      )}
    </ToolCallCard>
  );
}
