import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { convSidePane } from "@plugins/conversations/plugins/conversation-view/plugins/side-conversation/web";
import { useConversationById } from "@plugins/conversations/web";
import {
  ConversationItem,
  CONV_STATUS_DOT,
} from "@plugins/conversations/plugins/conversation-ui/plugins/item/web";
import { usePaneMatch } from "@plugins/primitives/plugins/pane/web";

export function ConvChip({ content }: { content: string; attrs: Record<string, string> }) {
  const sideConvId = content.trim();
  const conv = useConversationById(sideConvId || null);
  const match = usePaneMatch();
  const parentEntry = match?.chain.find(
    (e) => e.pane === conversationPane._internal,
  );
  const parentConvId = parentEntry?.params.convId;
  const title = conv?.title?.trim();
  if (!sideConvId) return null;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        // Inside a host conversation → open as right side pane. When already
        // at /c/A/c/B, parentConvId stays A so clicking <conv>C</conv>
        // rewrites to /c/A/c/C (replace the side, host unchanged).
        // Self-reference or out-of-conversation context → full /c view.
        if (parentConvId && parentConvId !== sideConvId) {
          convSidePane.open({ convId: parentConvId, sideConvId });
        } else {
          conversationPane.open({ convId: sideConvId });
        }
      }}
      className="inline-flex max-w-full items-center gap-1.5 rounded bg-muted px-1.5 py-0.5 align-baseline text-xs text-primary hover:bg-muted/80 hover:underline"
      title={title ? `${title} · ${sideConvId}` : sideConvId}
    >
      {conv ? (
        <ConversationItem conv={conv} layout="inline" />
      ) : (
        <>
          <span
            className={`inline-block size-1.5 shrink-0 rounded-full ${CONV_STATUS_DOT.gone}`}
          />
          <span className="truncate font-mono">{sideConvId}</span>
        </>
      )}
    </button>
  );
}
