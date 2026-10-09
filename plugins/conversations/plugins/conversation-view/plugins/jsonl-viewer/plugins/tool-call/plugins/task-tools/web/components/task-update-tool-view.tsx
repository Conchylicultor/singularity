import type { ToolRendererProps } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/core";
import { ToolCallCard } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";

type TaskUpdateInput = {
  taskId?: string;
  id?: string;
  status?: string;
  description?: string;
};

function statusBadgeClass(status: string): string {
  switch (status) {
    case "in_progress":
      return "bg-info/15 text-info";
    case "completed":
      return "bg-success/15 text-success";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export function TaskUpdateToolView({ event }: ToolRendererProps) {
  const input = event.input as TaskUpdateInput;

  const taskId = input.taskId ?? input.id;
  const summary =
    taskId || input.status ? (
      <Line as="span" className="gap-sm">
        {taskId && <span className="font-mono text-2xs">{taskId}</span>}
        {input.status && (
          <Badge colorClass={statusBadgeClass(input.status)}>
            {input.status}
          </Badge>
        )}
      </Line>
    ) : undefined;

  return (
    <ToolCallCard event={event} summary={summary} defaultOpen={false}>
      {input.description && (
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
