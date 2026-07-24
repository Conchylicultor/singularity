import { CollapsibleCard } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/collapsible-card/web";
import { CodeWithLineNumbers } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/code-listing/web";
import { FilePath } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/file-path/web";
import type { AttachmentRendererProps } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/attachment/core";

interface EditedTextFilePayload {
  type: "edited_text_file";
  filename: string;
  snippet: string;
}

export function EditedTextFileView({ event }: AttachmentRendererProps) {
  const att = event.attachment as EditedTextFilePayload;

  return (
    <CollapsibleCard label="Edited file" aside={<FilePath filePath={att.filename} />}>
      <CodeWithLineNumbers content={att.snippet ?? ""} filePath={att.filename} />
    </CollapsibleCard>
  );
}
