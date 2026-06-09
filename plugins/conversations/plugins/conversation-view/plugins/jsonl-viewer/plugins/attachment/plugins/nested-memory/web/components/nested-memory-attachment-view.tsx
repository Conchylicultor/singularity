import { CollapsibleCard } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/collapsible-card/web";
import type { AttachmentRendererProps } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/attachment/core";

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
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-xs text-muted-foreground leading-5">
        {att.content?.content ?? JSON.stringify(att, null, 2)}
      </pre>
    </CollapsibleCard>
  );
}
