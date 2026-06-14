import type { ComponentType } from "react";
import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/core";
import { MdPlaylistAdd, MdNorthEast, MdClose } from "react-icons/md";
import { EventLine } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/web";
import { QueuedPromptCard } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/queued-prompt-card/web";

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
// prompts. An `enqueue` with content shares the QueuedPromptCard appearance with
// the `queued_command` attachment (closed by default — this is the lifecycle
// marker, not the user's standing intent); the dequeue/remove markers stay
// compact one-liners on the ambient EventLine grammar.
export function QueueOperationRow({ event }: { event: JsonlEvent }) {
  const e = event as QueueOperationEvent;

  if (e.operation === "enqueue" && e.content) {
    return <QueuedPromptCard prompt={e.content} />;
  }

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
