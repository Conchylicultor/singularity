import { createContext, useContext, type ReactElement } from "react";
import { MdClose } from "react-icons/md";
import { useResource, matchResource } from "@plugins/primitives/plugins/live-state/web";
import { defineItemActions } from "@plugins/primitives/plugins/data-view/web";
import type {
  DataViewSourceProps,
  ItemActionProps,
} from "@plugins/primitives/plugins/data-view/web";
import { RowActionButton } from "@plugins/primitives/plugins/row-actions/web";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import {
  conversationsRevisionResource,
  queryConversations,
} from "@plugins/conversations/plugins/all-conversations/core";
import { conversationFieldDefs } from "@plugins/conversations/plugins/all-conversations/web";
import { ConversationItem } from "@plugins/conversations/plugins/conversation-ui/plugins/item/web";
import type { ConversationSidebarProps } from "@plugins/conversations/plugins/conversations-view/plugins/data-view/web";
import type { Conversation } from "@plugins/tasks/plugins/tasks-core/core";

// Per-consumer trailing-action slot. The close action contribution lives in this
// plugin's `web/index.ts`.
export const HistoryItemActions = defineItemActions<Conversation>(
  "conversations-sidebar-history-actions",
);

/**
 * The per-render close handler cannot ride on `itemActions` props (item-action
 * components receive only `{ row, hasChildren }`), so it is threaded through this
 * module-scoped context, provided by {@link HistorySource}.
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
 * The History source of the merged conversation-sidebar DataView: the History
 * list handed to the shared surface as a server-delegated bundle, reusing the
 * `all-conversations` query infra (keyset cursor over `conversations_v`,
 * `created_at DESC`). System conversations are included
 * (`includeSystem: true`); the authored "Hide system" filter preset lets the
 * user drop them.
 *
 * `render(bundle)` is ALWAYS called — rows come from the server `dataSource`,
 * so the bundle's `rows` stays `[]` by design.
 */
export function HistorySource({
  hostProps,
  render,
}: DataViewSourceProps<ConversationSidebarProps>): ReactElement {
  const { activeId, onNavigate, onCloseConversation } = hostProps;
  // The cheap scalar tick drives an in-place refetch of the loaded window; the
  // paginated SQL query is the source of truth. While pending, hand a null tick.
  const tick = useResource(conversationsRevisionResource);
  const changeTick = matchResource(tick, {
    pending: () => null,
    ready: (d) => d.rev,
  });

  return (
    <CloseConversationContext.Provider value={onCloseConversation}>
      {render<Conversation>({
        rows: [],
        fields: conversationFieldDefs,
        rowKey: (c) => c.id,
        selectedRowId: activeId ?? undefined,
        onRowActivate: (c) => onNavigate(c.id),
        viewOptions: {
          list: {
            renderRow: (c: Conversation) => <ConversationItem conv={c} layout="block" />,
          },
        },
        itemActions: HistoryItemActions,
        dataSource: {
          changeTick,
          fetchPage: (args) =>
            fetchEndpoint(queryConversations, {}, { body: { ...args, includeSystem: true } }),
        },
      })}
    </CloseConversationContext.Provider>
  );
}
