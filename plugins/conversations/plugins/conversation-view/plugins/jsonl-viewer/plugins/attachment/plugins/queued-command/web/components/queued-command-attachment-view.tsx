import type { AttachmentRendererProps } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/attachment/core";
import { QueuedPromptCard } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/queued-prompt-card/web";

interface QueuedCommandPayload {
  type: "queued_command";
  prompt: string;
  commandMode: string;
}

// A prompt the user typed while the agent was busy, parked in the queue for
// delivery on the next turn. Renders through the shared QueuedPromptCard so it
// stays visually identical to the prompt-queue enqueue row. Default-open: it is
// the human's standing intent, the content is the whole point.
export function QueuedCommandAttachmentView({ event }: AttachmentRendererProps) {
  const att = event.attachment as QueuedCommandPayload;

  return (
    <QueuedPromptCard prompt={att.prompt} commandMode={att.commandMode} defaultOpen />
  );
}
