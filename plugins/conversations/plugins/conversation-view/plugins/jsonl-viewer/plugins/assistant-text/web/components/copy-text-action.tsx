import type { JsonlEvent } from "../../../../shared";
import { CopyTextAction } from "../../../../web/components/copy-button";

export function CopyAssistantTextAction({ event }: { event: JsonlEvent }) {
  if (event.kind !== "assistant-text") return null;
  return <CopyTextAction text={event.text} title="Copy message" />;
}
