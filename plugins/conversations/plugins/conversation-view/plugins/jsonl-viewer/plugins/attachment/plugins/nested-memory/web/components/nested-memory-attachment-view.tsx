import { CollapsibleCard } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/collapsible-card/web";
import type { AttachmentRendererProps } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/attachment/core";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";

interface NestedMemoryPayload {
  type: "nested_memory";
  path: string;
  displayPath: string;
  content: {
    path: string;
    type: string;
    content: string;
  };
}

export function NestedMemoryAttachmentView({ event }: AttachmentRendererProps) {
  const att = event.attachment as NestedMemoryPayload;

  return (
    <CollapsibleCard label="Memory" filePath={att.path}>
      <Text
        as="pre"
        variant="caption"
        className="max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-muted-foreground"
      >
        {att.content?.content ?? JSON.stringify(att, null, 2)}
      </Text>
    </CollapsibleCard>
  );
}
