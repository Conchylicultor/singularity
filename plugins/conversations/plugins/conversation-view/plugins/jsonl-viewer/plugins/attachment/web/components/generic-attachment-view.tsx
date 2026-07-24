import { CollapsibleCard } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/collapsible-card/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import type { AttachmentRendererProps } from "../../core";

export function GenericAttachmentView({ event }: AttachmentRendererProps) {
  return (
    <CollapsibleCard label={`attachment:${event.subtype}`}>
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
