import {
  useCollapsible,
  CollapsibleChevron,
} from "@plugins/primitives/plugins/collapsible/web";
import { FilePath } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/file-path/web";
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
  const { open, triggerProps, contentId } = useCollapsible();

  return (
    <div className="rounded-md border border-border/40 bg-muted/20 px-3 py-2">
      <button
        {...triggerProps}
        className="flex w-full items-center gap-2 text-left text-[10px] uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
      >
        <CollapsibleChevron open={open} className="size-3" />
        <FilePath filePath={att.path} />
      </button>
      {open && (
        <div id={contentId} className="mt-2 border-l-2 border-muted-foreground/20 pl-3">
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-xs text-muted-foreground leading-5">
            {att.content?.content ?? JSON.stringify(att, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
