import type { ToolRendererProps } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/core";
import { ToolCallCard } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";

type TaskCreateInput = {
  subject?: string;
  description?: string;
  activeForm?: string;
};

export function TaskCreateToolView({ event }: ToolRendererProps) {
  const input = event.input as TaskCreateInput;

  const summary = (
    <span className="truncate">{input.subject ?? input.description ?? "New task"}</span>
  );

  return (
    <ToolCallCard event={event} summary={summary} defaultOpen={false}>
      {input.description && input.subject && (
        <Text
          as="p"
          variant="caption"
          // eslint-disable-next-line spacing/no-adhoc-spacing -- mt-2 offsets the description from the card header
          className="mt-2 text-muted-foreground whitespace-pre-wrap"
        >
          {input.description}
        </Text>
      )}
      {event.result?.isError && (
        // eslint-disable-next-line spacing/no-adhoc-spacing -- mt-2 separates the error text from preceding content
        <Text as="p" variant="caption" className="mt-2 text-destructive">
          {event.result.content}
        </Text>
      )}
    </ToolCallCard>
  );
}
