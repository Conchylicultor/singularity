import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { loadRouteForConversation } from "@plugins/conversations/plugins/pane-restore/web";
import { useOpenPane, usePaneStore } from "@plugins/primitives/plugins/pane/web";
import { LaunchControl } from "@plugins/primitives/plugins/launch/web";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { closeConversation } from "@plugins/conversations/core";
import { Column } from "@plugins/primitives/plugins/css/plugins/column/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { conversationsSidebarRegionWeb } from "@plugins/conversations/plugins/conversations-view/plugins/sidebar-region/web";

const { Region, Picker } = conversationsSidebarRegionWeb;

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

  // Shared chrome (launch button + variant picker) sits above the variant
  // region, reproducing the rigid `px-sm pb-xs` header block the tabbed `Host`
  // used to apply around the launch button. `scrollBody={false}` lets the
  // variant own its single scroll (its own `Column`/`Scroll`), so the list
  // scrolls internally and the variant's tab switcher stays rigid.
  return (
    <Column
      fill
      header={
        <Stack gap="xs" className="px-sm pb-xs">
          <LaunchControl variant="outline" fullWidth />
          <Picker />
        </Stack>
      }
      scrollBody={false}
      body={
        <Region
          activeId={activeId}
          onNavigate={navigate}
          onCloseConversation={handleCloseConversation}
        />
      }
    />
  );
}
