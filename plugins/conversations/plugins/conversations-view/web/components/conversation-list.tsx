import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { loadRouteForConversation } from "@plugins/conversations/plugins/pane-restore/web";
import { useOpenPane, usePaneStore } from "@plugins/primitives/plugins/pane/web";
import { LaunchControl } from "@plugins/primitives/plugins/launch/web";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { closeConversation } from "@plugins/conversations/core";
import { ConversationsView } from "../slots";

export function ConversationList() {
  const openPane = useOpenPane();
  const store = usePaneStore();

  // Highlight the conversation active in THIS surface's route — not the
  // focused window's URL. A background/secondary visible surface reflects its
  // own route. The conversation pane can appear more than once in a route; the
  // last instance is the one in focus.
  const entries = conversationPane.useRouteEntries();
  const activeId = entries[entries.length - 1]?.params.convId ?? null;

  const handleCloseConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await fetchEndpoint(closeConversation, { id });
  };

  const navigate = (id: string) => {
    const saved = loadRouteForConversation(id);
    if (saved && saved.length > 1) {
      store.restoreRoute(saved);
    } else {
      openPane(conversationPane, { convId: id }, { mode: "root" });
    }
  };

  return (
    <ConversationsView.Host
      activeId={activeId}
      onNavigate={navigate}
      onCloseConversation={handleCloseConversation}
      header={<LaunchControl variant="outline" fullWidth />}
    />
  );
}
