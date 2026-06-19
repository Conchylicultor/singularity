import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/core";
import { CollapsibleCard } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/collapsible-card/web";
import { useJsonlConversationId } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/web";
import { InvestigateEventButton } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/investigate-event/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";

type UnknownEvent = Extract<JsonlEvent, { kind: "unknown" }>;

export function UnknownRow({ event }: { event: JsonlEvent }) {
  const e = event as UnknownEvent;
  const conversationId = useJsonlConversationId();

  return (
    <CollapsibleCard
      label={e.type}
      trailing={
        <InvestigateEventButton
          label={e.type}
          json={e.raw}
          sourceConversationId={conversationId}
          className="opacity-0 pointer-events-none group-hover/row:opacity-100 group-hover/row:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto transition-opacity"
        />
      }
    >
      <Text as="pre" variant="caption" tone="muted" className="whitespace-pre-wrap break-words font-mono">
        {JSON.stringify(e.raw, null, 2)}
      </Text>
    </CollapsibleCard>
  );
}
