import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/core";
import { FilePath } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/file-path/web";
import { CollapsibleCard } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/collapsible-card/web";
import { EventLine } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/web";
import { StatusDot } from "@plugins/primitives/plugins/css/plugins/status-dot/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Frame } from "@plugins/primitives/plugins/css/plugins/frame/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";

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
  const summary = <span className="truncate">{e.summary}</span>;
  const hasExtra = !!e.extra && Object.keys(e.extra).length > 0;

  // Arbitrary, potentially long `extra` fields fold behind the row's own
  // chevron so the default stays a single quiet line; the summary is the
  // human-readable headline, so nothing is lost while collapsed.
  if (hasExtra) {
    return (
      <CollapsibleCard
        label={
          <Frame
            gap="xs"
            leading={
              <>
                {dot}
                <span className="font-medium">{label}</span>
              </>
            }
            content={e.summary}
          />
        }
        aside={e.outputFile ? <FilePath filePath={e.outputFile} /> : undefined}
      >
        <Stack gap="xs">
          {Object.entries(e.extra ?? {}).map(([k, v]) => (
            <Text
              key={k}
              as="div"
              variant="caption"
              className="whitespace-pre-wrap break-words text-muted-foreground"
            >
              <span className="text-muted-foreground/60">{k}: </span>
              {v}
            </Text>
          ))}
        </Stack>
      </CollapsibleCard>
    );
  }

  // No extra: a pure one-liner. A short output path rides inline as a chip
  // (FilePath truncates with an RTL ellipsis if it gets long).
  return (
    <EventLine icon={dot} label={label}>
      {summary}
      {e.outputFile && <FilePath filePath={e.outputFile} />}
    </EventLine>
  );
}
