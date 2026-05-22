import type { ToolRendererProps } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/core";
import { ToolCallCard } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/web";

type TaskUpdateInput = {
  taskId?: string;
  id?: string;
  status?: string;
  description?: string;
};

function statusBadgeClass(status: string): string {
  switch (status) {
    case "in_progress":
      return "bg-blue-500/15 text-blue-700 dark:text-blue-400";
    case "completed":
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export function TaskUpdateToolView({ event }: ToolRendererProps) {
  const input = event.input as TaskUpdateInput;

  const summary = (
    <span className="flex min-w-0 items-center gap-2">
      {(input.taskId ?? input.id) && (
        <span className="shrink-0 font-mono text-[11px]">{input.taskId ?? input.id}</span>
      )}
      {input.status && (
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${statusBadgeClass(input.status)}`}
        >
          {input.status}
        </span>
      )}
    </span>
  );

  return (
    <ToolCallCard event={event} summary={summary} defaultOpen={false}>
      {input.description && (
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
