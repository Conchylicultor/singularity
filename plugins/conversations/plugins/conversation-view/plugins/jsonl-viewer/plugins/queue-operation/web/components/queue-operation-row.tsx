import type { ComponentType } from "react";
import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/core";
import { MdPlaylistAdd, MdNorthEast, MdClose, MdNotificationsActive } from "react-icons/md";
import { Badge, type BadgeVariant } from "@plugins/primitives/plugins/badge/web";

type QueueOperationEvent = Extract<JsonlEvent, { kind: "queue-operation" }>;

const OPERATIONS: Record<
  string,
  { icon: ComponentType<{ className?: string }>; label: string }
> = {
  enqueue: { icon: MdPlaylistAdd, label: "Queued" },
  dequeue: { icon: MdNorthEast, label: "Sent to agent" },
  remove: { icon: MdClose, label: "Removed from queue" },
};

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

/**
 * Background-task completions are enqueued as raw `<task-notification>` XML.
 * Surface the human-readable summary + status instead of dumping the markup;
 * the full payload stays available via the row's hover-only raw-JSON action.
 */
function taskNotificationSummary(
  content: string,
): { status: string; summary: string } | null {
  if (!content.includes("<task-notification>")) return null;
  const status = /<status>([\s\S]*?)<\/status>/.exec(content)?.[1]?.trim() ?? "";
  const summary = /<summary>([\s\S]*?)<\/summary>/.exec(content)?.[1]?.trim() ?? "";
  return { status: decodeEntities(status), summary: decodeEntities(summary) };
}

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  completed: "success",
  failed: "destructive",
};

export function QueueOperationRow({ event }: { event: JsonlEvent }) {
  const e = event as QueueOperationEvent;
  const op = OPERATIONS[e.operation] ?? {
    icon: MdPlaylistAdd,
    label: e.operation,
  };
  const Icon = op.icon;
  const task = e.content ? taskNotificationSummary(e.content) : null;

  return (
    <div className="flex items-center gap-2 px-1 py-0.5 text-xs text-muted-foreground">
      <span
        className="flex shrink-0 items-center gap-1 font-medium tracking-wide text-2xs"
      >
        <Icon className="size-3.5" />
        {op.label}
      </span>
      {task ? (
        <span className="flex min-w-0 items-center gap-1.5">
          <Badge
            variant={STATUS_VARIANT[task.status] ?? "muted"}
            size="sm"
            className="shrink-0"
            icon={<MdNotificationsActive />}
          >
            task {task.status}
          </Badge>
          <span className="truncate">{task.summary}</span>
        </span>
      ) : e.content ? (
        <span className="truncate">{e.content}</span>
      ) : null}
    </div>
  );
}
