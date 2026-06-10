import type { ToolRendererProps } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/core";
import { ToolCallCard } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/web";
import { Text } from "@plugins/primitives/plugins/text/web";

type TaskOutputInput = {
  taskId?: string;
  id?: string;
};

export function TaskOutputToolView({ event }: ToolRendererProps) {
  const input = event.input as TaskOutputInput;
  const taskId = input.taskId ?? input.id;

  const summary = taskId ? (
    <span className="font-mono text-2xs">{taskId}</span>
  ) : undefined;

  return (
    <ToolCallCard event={event} summary={summary} defaultOpen={false}>
      {event.result && !event.result.isError && (
        <pre className="mt-2 max-h-[200px] overflow-auto rounded-md bg-muted/50 p-2 text-2xs text-muted-foreground whitespace-pre-wrap">
          {event.result.content}
        </pre>
      )}
      {event.result?.isError && (
        <Text as="p" variant="caption" className="mt-2 text-destructive">{event.result.content}</Text>
      )}
    </ToolCallCard>
  );
}
