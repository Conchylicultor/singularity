import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/core";
import { Timestamp } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/web";
import { ToolFilePath } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/web";

type TaskNotificationEvent = Extract<JsonlEvent, { kind: "task-notification" }>;

const STATUS_CLASS: Record<string, string> = {
  completed: "text-green-600 dark:text-green-400",
  failed: "text-red-500 dark:text-red-400",
};

export function TaskNotificationRow({ event }: { event: JsonlEvent }) {
  const e = event as TaskNotificationEvent;
  const statusClass = STATUS_CLASS[e.status] ?? "text-muted-foreground";
  return (
    <div className="flex flex-col gap-0.5 px-1 py-0.5 text-xs text-muted-foreground">
      <div className="flex items-center gap-2">
        <Timestamp at={e.at} className="tabular-nums" />
        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">
          {e.taskId}
        </span>
        <span className={statusClass}>{e.status}</span>
        <span className="truncate">{e.summary}</span>
      </div>
      {(e.outputFile || (e.extra && Object.keys(e.extra).length > 0)) && (
        <div className="flex items-center gap-2 ml-1">
          {e.outputFile && (
            <>
              <span className="text-muted-foreground/60 shrink-0">output:</span>
              <ToolFilePath filePath={e.outputFile} />
            </>
          )}
          {e.extra &&
            Object.entries(e.extra).map(([k, v]) => (
              <span
                key={k}
                className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]"
              >
                {k}: {v}
              </span>
            ))}
        </div>
      )}
    </div>
  );
}
