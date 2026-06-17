import { CollapsibleCard } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/collapsible-card/web";
import { useJsonlConversationId } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/web";
import { InvestigateEventButton } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/investigate-event/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import type { AttachmentRendererProps } from "../../core";

export function GenericAttachmentView({ event }: AttachmentRendererProps) {
  const conversationId = useJsonlConversationId();

  return (
    <CollapsibleCard
      label={`attachment:${event.subtype}`}
      trailing={
        <InvestigateEventButton
          label={`attachment:${event.subtype}`}
          json={event.attachment}
          sourceConversationId={conversationId}
          className="opacity-0 group-hover/row:opacity-100 focus-within:opacity-100 transition-opacity"
        />
      }
    >
      <Text
        as="pre"
        variant="caption"
        className="whitespace-pre-wrap break-words font-mono text-muted-foreground"
      >
        {JSON.stringify(event.attachment, null, 2)}
      </Text>
    </CollapsibleCard>
  );
}
