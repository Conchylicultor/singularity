import {
  useCollapsible,
  CollapsibleChevron,
} from "@plugins/primitives/plugins/collapsible/web";
import type { AttachmentRendererProps } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/attachment/core";

interface DeferredToolsDeltaPayload {
  type: "deferred_tools_delta";
  addedNames: string[];
  addedLines: string[];
  removedNames: string[];
}

export function DeferredToolsDeltaView({ event }: AttachmentRendererProps) {
  const att = event.attachment as DeferredToolsDeltaPayload;
  const { open, triggerProps, contentId } = useCollapsible();
  const added = att.addedNames?.length ?? 0;
  const removed = att.removedNames?.length ?? 0;

  const counts = [
    added > 0 ? `+${added}` : null,
    removed > 0 ? `−${removed}` : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="rounded-md border border-border/40 bg-muted/20 px-3 py-2">
      <button
        {...triggerProps}
        className="flex w-full items-center gap-2 text-left text-[10px] tracking-wide text-muted-foreground hover:text-foreground transition-colors"
      >
        <CollapsibleChevron open={open} className="size-3" />
        <span className="font-mono">
          Tools Delta{" "}
          <span className="text-muted-foreground/60">
            {counts ? `(${counts})` : "(no changes)"}
          </span>
        </span>
      </button>
      {open && (
        <div id={contentId} className="mt-2 border-l-2 border-muted-foreground/20 pl-3">
          {added === 0 && removed === 0 ? (
            <p className="text-xs text-muted-foreground/60 italic">No changes.</p>
          ) : (
            <div className="flex flex-col gap-0.5 text-xs font-mono leading-5">
              {att.addedNames?.map((name) => (
                <p key={name} className="text-muted-foreground">
                  <span className="text-success">+</span> {name}
                </p>
              ))}
              {att.removedNames?.map((name) => (
                <p key={name} className="text-muted-foreground line-through">
                  <span className="text-destructive no-underline">−</span> {name}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
