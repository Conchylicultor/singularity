import type { ComponentType } from "react";
import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/core";
import { MdPlaylistAdd, MdNorthEast, MdClose } from "react-icons/md";
import { EventLine } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/web";

type QueueOperationEvent = Extract<JsonlEvent, { kind: "queue-operation" }>;

const OPERATIONS: Record<
  string,
  { icon: ComponentType<{ className?: string }>; label: string }
> = {
  enqueue: { icon: MdPlaylistAdd, label: "Queued" },
  dequeue: { icon: MdNorthEast, label: "Sent to agent" },
  remove: { icon: MdClose, label: "Removed from queue" },
};

// Background-task completions are split out into structured `task-notification`
// rows by the transcript parser, so this renderer only ever sees plain queued
// prompts — a compact one-liner sharing the ambient EventLine grammar.
export function QueueOperationRow({ event }: { event: JsonlEvent }) {
  const e = event as QueueOperationEvent;
  const op = OPERATIONS[e.operation] ?? {
    icon: MdPlaylistAdd,
    label: e.operation,
  };
  const Icon = op.icon;

  return (
    <EventLine icon={<Icon className="size-3.5" />} label={op.label}>
      {e.content ? <span className="truncate">{e.content}</span> : null}
    </EventLine>
  );
}
