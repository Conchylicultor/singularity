import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { CONV_STATUS_DOT, useConversationById } from "@plugins/conversations/web";

export function ConvChip({ children }: { children: string; attrs: Record<string, string> }) {
  const convId = children.trim();
  const conv = useConversationById(convId || null);
  const title = conv?.title?.trim();
  const isSystem = conv?.kind === "system";
  const dotClass = conv ? CONV_STATUS_DOT[conv.status] : "bg-muted-foreground/40";
  if (!convId) return null;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        conversationPane.open({ convId });
      }}
      className="inline-flex max-w-full items-center gap-1.5 rounded bg-muted px-1.5 py-0.5 align-baseline text-xs text-primary hover:bg-muted/80 hover:underline"
      title={title ? `${title} · ${convId}` : convId}
    >
      <span className={`inline-block size-1.5 shrink-0 rounded-full ${dotClass}`} />
      <span className={title ? "truncate" : "truncate font-mono"}>
        {title ?? convId}
      </span>
      {isSystem && (
        <span className="shrink-0 rounded-sm bg-background/60 px-1 text-[9px] uppercase tracking-wide text-muted-foreground/80">
          sys
        </span>
      )}
    </button>
  );
}
