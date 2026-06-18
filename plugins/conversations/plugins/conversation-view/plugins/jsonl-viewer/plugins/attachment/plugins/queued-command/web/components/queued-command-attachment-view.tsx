import type { AttachmentRendererProps } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/attachment/core";
import { QueuedPromptCard } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/queued-prompt-card/web";
import { parseStructuredTag } from "../internal/parse-structured-tag";
import { StructuredTagCard } from "./structured-tag-card";

interface QueuedCommandPayload {
  type: "queued_command";
  prompt: string;
  commandMode: string;
}

// A `queued_command` carries two very different things on the same shape:
//   • a human prompt the user parked while the agent was busy (commandMode
//     "prompt"), and
//   • a harness-injected control message the queue mechanism delivers as a
//     command (e.g. a `<task-notification>` block, commandMode "task-notification").
//
// The human prompt is the user's standing intent — show it verbatim, default
// open, via the shared QueuedPromptCard. A harness control message is structured
// XML; when we can parse it as a single tag block we render it generically as a
// titled key/value card so it reads cleanly instead of as a raw XML dump — and,
// being field-agnostic, surfaces new fields automatically. Anything that isn't a
// plain prompt yet doesn't parse falls back to the raw card untouched.
export function QueuedCommandAttachmentView({ event }: AttachmentRendererProps) {
  const att = event.attachment as QueuedCommandPayload;
  const isPlainPrompt = !att.commandMode || att.commandMode === "prompt";
  const structured = isPlainPrompt ? null : parseStructuredTag(att.prompt);

  if (structured) {
    return <StructuredTagCard structured={structured} />;
  }

  return (
    <QueuedPromptCard prompt={att.prompt} commandMode={att.commandMode} defaultOpen />
  );
}
