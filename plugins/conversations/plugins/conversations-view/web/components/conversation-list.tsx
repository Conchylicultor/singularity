import { useEffect, useState } from "react";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { loadRouteForConversation } from "@plugins/conversations/plugins/pane-restore/web";
import { restoreRoute, useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { LaunchControl } from "@plugins/primitives/plugins/launch/web";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { closeConversation } from "@plugins/conversations/core";
import { ConversationsView } from "../slots";

function activeIdFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/c\/([^/]+)/);
  return m ? decodeURIComponent(m[1]!) : null;
}

export function ConversationList() {
  const openPane = useOpenPane();

  const [activeId, setActiveId] = useState<string | null>(() =>
    activeIdFromPath(window.location.pathname),
  );

  useEffect(() => {
    const sync = () => setActiveId(activeIdFromPath(window.location.pathname));
    window.addEventListener("popstate", sync);
    window.addEventListener("shell:navigate", sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener("shell:navigate", sync);
    };
  }, []);

  const handleCloseConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await fetchEndpoint(closeConversation, { id });
  };

  const navigate = (id: string) => {
    const saved = loadRouteForConversation(id);
    if (saved && saved.length > 1) {
      restoreRoute(saved);
    } else {
      openPane(conversationPane, { convId: id }, { mode: "root" });
    }
    setActiveId(id);
  };

  return (
    <ConversationsView.Host
      activeId={activeId}
      onNavigate={navigate}
      onCloseConversation={handleCloseConversation}
      header={<LaunchControl variant="outline" size="sm" fullWidth />}
    />
  );
}
