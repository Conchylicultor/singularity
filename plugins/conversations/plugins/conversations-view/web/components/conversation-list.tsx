import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import {
  loadRouteForConversation,
  reportCorruptSavedRoute,
} from "@plugins/conversations/plugins/pane-restore/web";
import { useOpenPane, usePaneStore } from "@plugins/primitives/plugins/pane/web";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { closeConversation } from "@plugins/conversations/core";
import { ConversationsSidebarDataView } from "@plugins/conversations/plugins/conversations-view/plugins/data-view/web";

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
    const result = loadRouteForConversation(id);
    // A corrupt saved route (parse failure or unrecognized shape) is a real
    // fault — surface it as a deduped crash task rather than silently opening a
    // fresh pane as if nothing had been saved. Navigation still proceeds below.
    if (result.kind === "corrupt") reportCorruptSavedRoute(result.reason);
    if (result.kind === "restored" && result.slots.length > 1) {
      store.restoreRoute(result.slots);
    } else {
      openPane(conversationPane, { convId: id }, { mode: "root" });
    }
  };

  // The merged DataView surface owns its own `Scroll fill` root, so it fills
  // the sidebar column directly — no extra wrapper needed.
  return (
    <ConversationsSidebarDataView
      activeId={activeId}
      onNavigate={navigate}
      onCloseConversation={handleCloseConversation}
    />
  );
}
