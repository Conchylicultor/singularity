import { createContext, useContext, type ReactElement } from "react";
import { MdClose } from "react-icons/md";
import { useResource, matchResource } from "@plugins/primitives/plugins/live-state/web";
import { DataView, defineDataView, defineItemActions } from "@plugins/primitives/plugins/data-view/web";
import type { ItemActionProps } from "@plugins/primitives/plugins/data-view/web";
import { RowActionButton } from "@plugins/primitives/plugins/row-actions/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import {
  conversationsRevisionResource,
  queryConversations,
} from "@plugins/conversations/plugins/all-conversations/core";
import { conversationFieldDefs } from "@plugins/conversations/plugins/all-conversations/web";
import { ConversationItem } from "@plugins/conversations/plugins/conversation-ui/plugins/item/web";
import type { ConversationSidebarProps } from "@plugins/conversations/plugins/conversations-view/plugins/data-view/web";
import type { Conversation } from "@plugins/tasks/plugins/tasks-core/core";

// The DataView surface id — the config lives under the defining plugin's tree at
// `config/conversations/conversations-view/data-view/conversations-sidebar-history.jsonc`.
const SIDEBAR_HISTORY_VIEW = defineDataView("conversations-sidebar-history");

// Per-consumer trailing-action slot. The close action contribution lives in this
// plugin's `web/index.ts`.
export const HistoryItemActions = defineItemActions<Conversation>(
  "conversations-sidebar-history-actions",
);

/**
 * The per-render close handler cannot ride on `itemActions` props (item-action
 * components receive only `{ row, hasChildren }`), so it is threaded through this
 * module-scoped context, provided by {@link SidebarDataViewBody}.
 */
const CloseConversationContext = createContext<
  ConversationSidebarProps["onCloseConversation"] | null
>(null);

/** The hover-revealed Close action contributed into {@link HistoryItemActions}. */
export function CloseConvAction({ row }: ItemActionProps<Conversation>): ReactElement | null {
  const onCloseConversation = useContext(CloseConversationContext);
  if (!onCloseConversation) return null;
  return (
    <RowActionButton
      icon={MdClose}
      label="Close conversation"
      onClick={(e) => {
        e.stopPropagation();
        return onCloseConversation(row.id, e);
      }}
    />
  );
}

/**
 * The `dataview` sidebar variant body: the History list rendered through the
 * official DataView primitive, reusing the `all-conversations` server-delegated
 * query infra (keyset cursor over `conversations_v`, `created_at DESC`). System
 * conversations are included (`includeSystem: true`); the authored "Hide system"
 * filter preset lets the user drop them.
 *
 * Wrapped in a `<Scroll axis="y" fill>` because the mount point renders the
 * region inside a `<Column scrollBody={false}>` — the DataView never owns a
 * scroller and needs this single scroll ancestor for the server-query sentinel +
 * row virtualization to bind to.
 */
export function SidebarDataViewBody({
  activeId,
  onNavigate,
  onCloseConversation,
}: ConversationSidebarProps): ReactElement {
  // The cheap scalar tick drives an in-place refetch of the loaded window; the
  // paginated SQL query is the source of truth. While pending, hand a null tick.
  const tick = useResource(conversationsRevisionResource);
  const changeTick = matchResource(tick, {
    pending: () => null,
    ready: (d) => d.rev,
  });

  return (
    <CloseConversationContext.Provider value={onCloseConversation}>
      <Scroll axis="y" fill className="h-full">
        <DataView<Conversation>
          storageKey={SIDEBAR_HISTORY_VIEW}
          rows={[]}
          fields={conversationFieldDefs}
          rowKey={(c) => c.id}
          views={["list"]}
          selectedRowId={activeId ?? undefined}
          onRowActivate={(c) => onNavigate(c.id)}
          viewOptions={{
            list: {
              renderRow: (c: Conversation) => <ConversationItem conv={c} layout="block" />,
            },
          }}
          itemActions={HistoryItemActions}
          dataSource={{
            changeTick,
            fetchPage: (args) =>
              fetchEndpoint(queryConversations, {}, { body: { ...args, includeSystem: true } }),
          }}
        />
      </Scroll>
    </CloseConversationContext.Provider>
  );
}
