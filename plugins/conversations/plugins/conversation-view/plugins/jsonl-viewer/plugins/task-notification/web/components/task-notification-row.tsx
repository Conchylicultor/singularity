import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/core";
import { FilePath } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/file-path/web";
import { Badge } from "@plugins/primitives/plugins/badge/web";
import { Text } from "@plugins/primitives/plugins/text/web";

type TaskNotificationEvent = Extract<JsonlEvent, { kind: "task-notification" }>;

const STATUS_CLASS: Record<string, string> = {
  completed: "text-success",
  failed: "text-destructive",
};

export function TaskNotificationRow({ event }: { event: JsonlEvent }) {
  const e = event as TaskNotificationEvent;
  const statusClass = STATUS_CLASS[e.status] ?? "text-muted-foreground";
  return (
    <Text as="div" variant="caption" className="flex flex-col gap-0.5 px-1 py-0.5 text-muted-foreground">
      <div className="flex items-center gap-2">
        <Badge variant="muted" size="sm" className="font-mono">
          {e.taskId}
        </Badge>
        <span className={statusClass}>{e.status}</span>
        <span className="truncate">{e.summary}</span>
      </div>
      {(e.outputFile || (e.extra && Object.keys(e.extra).length > 0)) && (
        <div className="flex items-center gap-2 ml-1">
          {e.outputFile && (
            <>
              <span className="text-muted-foreground/60 shrink-0">output:</span>
              <FilePath filePath={e.outputFile} />
            </>
          )}
          {e.extra &&
            Object.entries(e.extra).map(([k, v]) => (
              <Badge key={k} variant="muted" size="sm" className="font-mono">
                {k}: {v}
              </Badge>
            ))}
        </div>
      )}
    </Text>
  );
}
