import {
  useCollapsible,
  CollapsibleChevron,
} from "@plugins/primitives/plugins/collapsible/web";
import { FilePath } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/file-path/web";
import { CodeWithLineNumbers } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/code-listing/web";
import type { AttachmentRendererProps } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/attachment/core";

interface EditedTextFilePayload {
  type: "edited_text_file";
  filename: string;
  snippet: string;
}

export function EditedTextFileView({ event }: AttachmentRendererProps) {
  const att = event.attachment as EditedTextFilePayload;
  const { open, triggerProps, contentId } = useCollapsible();

  return (
    <div className="rounded-md border border-border/40 bg-muted/20 px-3 py-2">
      <div className="flex w-full items-center gap-2 text-3xs tracking-wide text-muted-foreground">
        <button
          {...triggerProps}
          className="flex shrink-0 items-center gap-2 text-left hover:text-foreground transition-colors"
        >
          <CollapsibleChevron open={open} className="size-3" />
          <span>Edited file</span>
        </button>
        <FilePath filePath={att.filename} />
      </div>
      {open && (
        <div
          id={contentId}
          className="mt-2 border-l-2 border-muted-foreground/20 pl-3"
        >
          <CodeWithLineNumbers content={att.snippet ?? ""} filePath={att.filename} />
        </div>
      )}
    </div>
  );
}
