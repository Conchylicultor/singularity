import type { ToolRendererProps } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/core";
import { ToolCallCard } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";

type TaskGetInput = {
  taskId?: string;
  id?: string;
};

export function TaskGetToolView({ event }: ToolRendererProps) {
  const input = event.input as TaskGetInput;
  const taskId = input.taskId ?? input.id;

  const summary = taskId ? (
    <span className="font-mono text-2xs">{taskId}</span>
  ) : undefined;

  return (
    <ToolCallCard event={event} summary={summary} defaultOpen={false}>
      {event.result && !event.result.isError && (
        // eslint-disable-next-line spacing/no-adhoc-spacing -- mt-2 offsets the result block from the card header
        <pre className="mt-2 max-h-[200px] overflow-auto rounded-md bg-muted/50 p-sm text-2xs text-muted-foreground">
          {event.result.content}
        </pre>
      )}
      {event.result?.isError && (
        // eslint-disable-next-line spacing/no-adhoc-spacing -- mt-2 offsets the error text from the card header
        <Text as="p" variant="caption" tone="destructive" className="mt-2">
          {event.result.content}
        </Text>
      )}
    </ToolCallCard>
  );
}
