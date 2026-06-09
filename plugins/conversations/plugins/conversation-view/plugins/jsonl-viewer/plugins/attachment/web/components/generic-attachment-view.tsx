import { CollapsibleCard } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/collapsible-card/web";
import { useJsonlConversationId } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/web";
import { InvestigateEventButton } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/investigate-event/web";
import type { AttachmentRendererProps } from "../../core";

export function GenericAttachmentView({ event }: AttachmentRendererProps) {
  const conversationId = useJsonlConversationId();

  return (
    <CollapsibleCard
      label={<span className="font-mono">attachment:{event.subtype}</span>}
      trailing={
        <InvestigateEventButton
          label={`attachment:${event.subtype}`}
          json={event.attachment}
          sourceConversationId={conversationId}
          className="opacity-0 group-hover/row:opacity-100 focus-within:opacity-100 transition-opacity"
        />
      }
    >
      <pre className="whitespace-pre-wrap break-words font-mono text-xs text-muted-foreground leading-5">
        {JSON.stringify(event.attachment, null, 2)}
      </pre>
    </CollapsibleCard>
  );
}
