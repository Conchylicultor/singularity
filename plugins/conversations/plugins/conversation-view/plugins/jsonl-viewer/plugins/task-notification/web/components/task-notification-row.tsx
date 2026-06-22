import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/core";
import { FilePath } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/file-path/web";
import { FieldsCard } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/fields-card/web";
import { EventLine } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/web";
import { StatusDot } from "@plugins/primitives/plugins/css/plugins/status-dot/web";

type TaskNotificationEvent = Extract<JsonlEvent, { kind: "task-notification" }>;

// Status colour rides a calm dot, never a filled badge, so the timeline stays
// quiet. Unknown statuses fall back to muted.
const STATUS_DOT: Record<string, string> = {
  completed: "bg-success",
  failed: "bg-destructive",
};

// "completed" → "Task completed". Natural case — jsonl-viewer bans all-caps.
function statusLabel(status: string): string {
  return status ? `Task ${status}` : "Task update";
}

export function TaskNotificationRow({ event }: { event: JsonlEvent }) {
  const e = event as TaskNotificationEvent;
  const dot = <StatusDot colorClass={STATUS_DOT[e.status] ?? "bg-muted-foreground"} />;
  const label = statusLabel(e.status);
  const hasExtra = !!e.extra && Object.keys(e.extra).length > 0;

  // Arbitrary, potentially long `extra` fields fold behind the card's chevron so
  // the default stays a single quiet line; the summary rides the header's
  // truncating slot and is repeated in full inside the body — the shared
  // FieldsCard owns that whole shape.
  if (hasExtra) {
    return (
      <FieldsCard
        icon={dot}
        label={<span className="font-medium">{label}</span>}
        summary={e.summary}
        fields={Object.entries(e.extra ?? {}).map(([key, value]) => ({ key, value }))}
        aside={e.outputFile ? <FilePath filePath={e.outputFile} /> : undefined}
      />
    );
  }

  // No extra: a pure one-liner. A short output path rides inline as a chip
  // (FilePath truncates with an RTL ellipsis if it gets long).
  return (
    <EventLine icon={dot} label={label}>
      <span className="truncate">{e.summary}</span>
      {e.outputFile && <FilePath filePath={e.outputFile} />}
    </EventLine>
  );
}
