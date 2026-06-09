import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/core";
import { CollapsibleCard } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/collapsible-card/web";

type AssistantThinkingEvent = Extract<JsonlEvent, { kind: "assistant-thinking" }>;

export function AssistantThinkingRow({ event }: { event: JsonlEvent }) {
  const e = event as AssistantThinkingEvent;

  return (
    <CollapsibleCard label="Thinking">
      <div className="whitespace-pre-wrap break-words font-mono text-xs text-muted-foreground leading-5">
        {e.thinking}
      </div>
    </CollapsibleCard>
  );
}
