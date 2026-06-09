import {
  useCollapsible,
  CollapsibleChevron,
} from "@plugins/primitives/plugins/collapsible/web";
import { useJsonlConversationId } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/web";
import { InvestigateEventButton } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/investigate-event/web";
import type { AttachmentRendererProps } from "../../core";

export function GenericAttachmentView({ event }: AttachmentRendererProps) {
  const { open, triggerProps, contentId } = useCollapsible();
  const conversationId = useJsonlConversationId();

  return (
    <div className="rounded-md border border-border/40 bg-muted/20 px-3 py-2">
      <div className="flex items-center gap-1 pr-10">
        <button
          {...triggerProps}
          className="flex min-w-0 items-center gap-2 text-left text-[10px] tracking-wide text-muted-foreground hover:text-foreground transition-colors"
        >
          <CollapsibleChevron open={open} className="size-3" />
          <span className="font-mono truncate">attachment:{event.subtype}</span>
        </button>
        <InvestigateEventButton
          label={`attachment:${event.subtype}`}
          json={event.attachment}
          sourceConversationId={conversationId}
          className="shrink-0 opacity-0 group-hover/row:opacity-100 focus-within:opacity-100 transition-opacity"
        />
      </div>
      {open && (
        <div id={contentId} className="mt-2 border-l-2 border-muted-foreground/20 pl-3">
          <pre className="whitespace-pre-wrap break-words font-mono text-xs text-muted-foreground leading-5">
            {JSON.stringify(event.attachment, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
