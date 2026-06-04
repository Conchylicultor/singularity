import { useMemo } from "react";
import type { ToolRendererProps } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/core";
import { ToolCallCard } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/web";
import { Badge } from "@plugins/primitives/plugins/badge/web";

type TaskListResult = Array<{ id?: string; description?: string; status?: string }>;

function parseResult(event: ToolRendererProps["event"]): TaskListResult | null {
  if (!event.result?.content) return null;
  try {
    const parsed = JSON.parse(event.result.content);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function TaskListToolView({ event }: ToolRendererProps) {
  const tasks = useMemo(() => parseResult(event), [event]);
  const count = tasks?.length ?? 0;

  const summary = (
    <span className="tabular-nums">{count} task{count !== 1 ? "s" : ""}</span>
  );

  return (
    <ToolCallCard event={event} summary={summary} defaultOpen={false}>
      {tasks && tasks.length > 0 && (
        <div className="mt-2 max-h-[200px] space-y-1 overflow-auto">
          {tasks.map((t, i) => (
            <div
              key={t.id ?? i}
              className="flex items-center gap-2 text-[11px] text-muted-foreground"
            >
              {t.id && <span className="shrink-0 font-mono">{t.id}</span>}
              {t.status && (
                <Badge variant="muted" size="sm" className="shrink-0">
                  {t.status}
                </Badge>
              )}
              {t.description && (
                <span className="min-w-0 truncate">{t.description}</span>
              )}
            </div>
          ))}
        </div>
      )}
      {event.result?.isError && (
        <p className="mt-2 text-xs text-destructive">{event.result.content}</p>
      )}
    </ToolCallCard>
  );
}
