import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { convSidePane } from "@plugins/conversations/plugins/conversation-view/plugins/side-conversation/web";
import { CONV_STATUS_DOT, useConversationById } from "@plugins/conversations/web";
import { usePaneMatch } from "@plugins/primitives/plugins/pane/web";

export function ConvChip({ children }: { children: string; attrs: Record<string, string> }) {
  const sideConvId = children.trim();
  const conv = useConversationById(sideConvId || null);
  const match = usePaneMatch();
  const parentEntry = match?.chain.find(
    (e) => e.pane === conversationPane._internal,
  );
  const parentConvId = parentEntry?.params.convId;
  const title = conv?.title?.trim();
  const isSystem = conv?.kind === "system";
  const dotClass = conv ? CONV_STATUS_DOT[conv.status] : "bg-muted-foreground/40";
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
      <span className={`inline-block size-1.5 shrink-0 rounded-full ${dotClass}`} />
      <span className={title ? "truncate" : "truncate font-mono"}>
        {title ?? sideConvId}
      </span>
      {isSystem && (
        <span className="shrink-0 rounded-sm bg-background/60 px-1 text-[9px] uppercase tracking-wide text-muted-foreground/80">
          sys
        </span>
      )}
    </button>
  );
}
