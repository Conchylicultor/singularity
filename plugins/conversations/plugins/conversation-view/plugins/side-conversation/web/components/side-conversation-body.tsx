import { PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { JsonlPane } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/web";
import { useConversation, useConversationById } from "@plugins/conversations/web";
import { convSidePane } from "../panes";

export function SideConversationBody() {
  const { sideConvId } = convSidePane.useParams();
  const live = useConversation(sideConvId);
  const fetched = useConversationById(live ? null : sideConvId);
  const conversation = live ?? fetched;

  if (!conversation) {
    return (
      <PaneChrome pane={convSidePane} title="Loading…">
        <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
          Loading conversation…
        </div>
      </PaneChrome>
    );
  }

  return (
    <PaneChrome
      pane={convSidePane}
      title={conversation.title ?? conversation.id}
    >
      <div className="h-full min-h-0 overflow-hidden">
        <JsonlPane conversation={conversation} />
      </div>
    </PaneChrome>
  );
}
