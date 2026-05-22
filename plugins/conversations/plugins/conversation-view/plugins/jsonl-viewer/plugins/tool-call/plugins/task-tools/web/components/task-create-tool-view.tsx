import type { ToolRendererProps } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/core";
import { ToolCallCard } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/web";

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
        <p className="mt-2 text-xs text-muted-foreground whitespace-pre-wrap">
          {input.description}
        </p>
      )}
      {event.result?.isError && (
        <p className="mt-2 text-xs text-destructive">{event.result.content}</p>
      )}
    </ToolCallCard>
  );
}
