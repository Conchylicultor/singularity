import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversationById } from "@plugins/conversations/web";
import {
  ConversationItem,
  CONV_STATUS_DOT,
} from "@plugins/conversations/plugins/conversation-ui/plugins/item/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { StatusDot } from "@plugins/primitives/plugins/status-dot/web";

export function ConvChip({ content }: { content: string; attrs: Record<string, string> }) {
  const sideConvId = content.trim();
  const conv = useConversationById(sideConvId || null);
  const openPane = useOpenPane();
  const title = conv?.title?.trim();
  if (!sideConvId) return null;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        openPane(conversationPane, { convId: sideConvId });
      }}
      className="inline-flex max-w-full items-center gap-1.5 rounded bg-muted px-1.5 py-0.5 align-baseline text-xs text-primary hover:bg-muted/80 hover:underline"
      title={title ? `${title} · ${sideConvId}` : sideConvId}
    >
      {conv ? (
        <ConversationItem conv={conv} layout="inline" />
      ) : (
        <>
          <StatusDot colorClass={CONV_STATUS_DOT.gone} />
          <span className="truncate font-mono">{sideConvId}</span>
        </>
      )}
    </button>
  );
}
