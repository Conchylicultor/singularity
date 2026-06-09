import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/core";
import { CollapsibleCard } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/collapsible-card/web";
import { useJsonlConversationId } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/web";
import { InvestigateEventButton } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/investigate-event/web";

type UnknownEvent = Extract<JsonlEvent, { kind: "unknown" }>;

export function UnknownRow({ event }: { event: JsonlEvent }) {
  const e = event as UnknownEvent;
  const conversationId = useJsonlConversationId();

  return (
    <CollapsibleCard
      label={<span className="font-mono">{e.type}</span>}
      trailing={
        <InvestigateEventButton
          label={e.type}
          json={e.raw}
          sourceConversationId={conversationId}
          className="opacity-0 group-hover/row:opacity-100 focus-within:opacity-100 transition-opacity"
        />
      }
    >
      <pre className="whitespace-pre-wrap break-words font-mono text-xs text-muted-foreground leading-5">
        {JSON.stringify(e.raw, null, 2)}
      </pre>
    </CollapsibleCard>
  );
}
