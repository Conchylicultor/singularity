import type { JsonlEvent } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/shared";
import { CopyTextAction } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/web";

export function CopyToolResultAction({ event }: { event: JsonlEvent }) {
  if (event.kind !== "user-tool-result") return null;
  return <CopyTextAction text={event.content ?? ""} title="Copy result" />;
}
