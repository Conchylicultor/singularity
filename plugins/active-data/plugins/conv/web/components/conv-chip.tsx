import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversationById } from "@plugins/conversations/web";
import {
  ConversationItem,
  CONV_STATUS_DOT,
} from "@plugins/conversations/plugins/conversation-ui/plugins/item/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { StatusDot } from "@plugins/primitives/plugins/css/plugins/status-dot/web";
import { LinkChip } from "@plugins/primitives/plugins/css/plugins/link-chip/web";

export function ConvChip({ content }: { content: string; attrs: Record<string, string> }) {
  const sideConvId = content.trim();
  const conv = useConversationById(sideConvId || null);
  const openPane = useOpenPane();
  const title = conv?.title?.trim();
  if (!sideConvId) return null;
  return (
    <LinkChip
      onClick={(e) => {
        e.stopPropagation();
        openPane(conversationPane, { convId: sideConvId }, { mode: "push" });
      }}
      title={title ? `${title} · ${sideConvId}` : sideConvId}
      leading={conv ? undefined : <StatusDot colorClass={CONV_STATUS_DOT.gone} />}
      mono={!conv}
    >
      {conv ? <ConversationItem conv={conv} layout="inline" /> : sideConvId}
    </LinkChip>
  );
}
