import { CollapsibleCard } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/collapsible-card/web";
import type { AttachmentRendererProps } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/attachment/core";

interface DeferredToolsDeltaPayload {
  type: "deferred_tools_delta";
  addedNames: string[];
  addedLines: string[];
  removedNames: string[];
}

export function DeferredToolsDeltaView({ event }: AttachmentRendererProps) {
  const att = event.attachment as DeferredToolsDeltaPayload;
  const added = att.addedNames?.length ?? 0;
  const removed = att.removedNames?.length ?? 0;

  const counts = [
    added > 0 ? `+${added}` : null,
    removed > 0 ? `−${removed}` : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <CollapsibleCard
      label={
        <span className="font-mono">
          Tools Delta{" "}
          <span className="text-muted-foreground/60">
            {counts ? `(${counts})` : "(no changes)"}
          </span>
        </span>
      }
    >
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
    </CollapsibleCard>
  );
}
