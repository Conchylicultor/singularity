import { createContext, useContext, type ReactElement } from "react";
import { MdClose, MdDeleteOutline, MdRemoveCircleOutline } from "react-icons/md";
import { defineItemActions } from "@plugins/primitives/plugins/data-view/web";
import type { ItemActionProps } from "@plugins/primitives/plugins/data-view/web";
import { RowActionButton } from "@plugins/primitives/plugins/row-actions/web";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import {
  deleteConversationGroup,
  removeConversationGroupMember,
} from "@plugins/conversations/plugins/conversations-view/plugins/grouped/core";
import type { ConversationSidebarProps } from "@plugins/conversations/plugins/conversations-view/plugins/data-view/web";
import type { GroupedRow } from "./use-grouped-rows";

/** Per-consumer trailing-action slot for the Grouped tab's rows. */
export const GroupedItemActions = defineItemActions<GroupedRow>(
  "conversations-sidebar-grouped-actions",
);

/**
 * The per-render close handler cannot ride on `itemActions` props (item-action
 * components receive only `{ row, hasChildren }`), so it is threaded through this
 * module-scoped context, provided by {@link SidebarGroupedBody}. Mirrors the
 * Queue / History tabs' `CloseConversationContext`.
 */
export const CloseConversationContext = createContext<
  ConversationSidebarProps["onCloseConversation"] | null
>(null);

/** Detach a conversation from its user group (it returns to Ungrouped). */
export function RemoveFromGroupAction({
  row,
}: ItemActionProps<GroupedRow>): ReactElement | null {
  if (row.kind !== "conv" || row.groupId === null) return null;
  return (
    <RowActionButton
      icon={MdRemoveCircleOutline}
      label="Remove from group"
      onClick={(e) => {
        e.stopPropagation();
        return fetchEndpoint(removeConversationGroupMember, { conversationId: row.id });
      }}
    />
  );
}

/** Delete a user group. Members are not deleted — they return to Ungrouped. */
export function DeleteGroupAction({
  row,
  hasChildren,
}: ItemActionProps<GroupedRow>): ReactElement | null {
  if (row.kind !== "group") return null;
  return (
    <RowActionButton
      icon={MdDeleteOutline}
      label={hasChildren ? "Delete group (members return to ungrouped)" : "Delete group"}
      onClick={(e) => {
        e.stopPropagation();
        return fetchEndpoint(deleteConversationGroup, { id: row.id });
      }}
    />
  );
}

/** Close the conversation (conversation + fork rows only). */
export function CloseAction({ row }: ItemActionProps<GroupedRow>): ReactElement | null {
  const onCloseConversation = useContext(CloseConversationContext);
  if (row.kind !== "conv" && row.kind !== "fork") return null;
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
