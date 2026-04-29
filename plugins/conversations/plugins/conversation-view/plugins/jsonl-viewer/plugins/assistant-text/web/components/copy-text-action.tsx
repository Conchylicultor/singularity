import type { JsonlEvent } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/shared";
import { CopyTextAction } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/web";

export function CopyAssistantTextAction({ event }: { event: JsonlEvent }) {
  if (event.kind !== "assistant-text") return null;
  return <CopyTextAction text={event.text} title="Copy message" />;
}
