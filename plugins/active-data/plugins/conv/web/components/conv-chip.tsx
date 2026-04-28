import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { CONV_STATUS_DOT, useConversationById } from "@plugins/conversations/web";

export function ConvChip({ children }: { children: string; attrs: Record<string, string> }) {
  const convId = children.trim();
  const conv = useConversationById(convId || null);
  const label = conv?.title?.trim() || convId;
  const dotClass = conv ? CONV_STATUS_DOT[conv.status] : "bg-muted-foreground/40";
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        conversationPane.open({ convId });
      }}
      className="inline-flex items-baseline gap-1.5 rounded bg-muted px-1.5 py-0.5 align-baseline font-mono text-xs text-primary hover:bg-muted/80 hover:underline"
      title={convId}
    >
      <span className={`inline-block size-1.5 self-center rounded-full ${dotClass}`} />
      <span className="truncate">{label}</span>
    </button>
  );
}
