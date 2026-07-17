import { createContext, useContext, type ReactElement } from "react";
import {
  MdClose,
  MdKeyboardDoubleArrowDown,
  MdOutlineQueue,
  MdVerticalAlignBottom,
  MdVerticalAlignTop,
} from "react-icons/md";
import { defineItemActions } from "@plugins/primitives/plugins/data-view/web";
import type { ItemActionProps } from "@plugins/primitives/plugins/data-view/web";
import { RowActionButton } from "@plugins/primitives/plugins/row-actions/web";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import {
  promoteQueue,
  demoteQueue,
  stepDownQueue,
  rerankQueue,
} from "@plugins/conversations/plugins/conversations-view/plugins/queue/core";
import type { ConversationSidebarProps } from "@plugins/conversations/plugins/conversations-view/plugins/data-view/web";
import type { QueueRow } from "./use-queue-rows";

/** Per-consumer trailing-action slot for the Queue tab's rows. */
export const QueueItemActions = defineItemActions<QueueRow>(
  "conversations-sidebar-queue-actions",
);

/**
 * The per-render close handler cannot ride on `itemActions` props (item-action
 * components receive only `{ row, hasChildren }`), so it is threaded through this
 * module-scoped context, provided by {@link SidebarQueueBody}. Mirrors the History
 * tab's `CloseConversationContext`.
 */
export const CloseConversationContext = createContext<
  ConversationSidebarProps["onCloseConversation"] | null
>(null);

/** Move the row's task-group to the top of the queue. */
export function PromoteAction({ row }: ItemActionProps<QueueRow>): ReactElement | null {
  if (row.section !== "queued" || row.isTop) return null;
  return (
    <RowActionButton
      icon={MdVerticalAlignTop}
      label="Move to top"
      onClick={(e) => {
        e.stopPropagation();
        return fetchEndpoint(promoteQueue, {}, { body: { conversationId: row.id } });
      }}
    />
  );
}

/** Step the row's task-group down five positions. */
export function StepDownAction({ row }: ItemActionProps<QueueRow>): ReactElement | null {
  if (!row.canStepDown) return null;
  return (
    <RowActionButton
      icon={MdKeyboardDoubleArrowDown}
      label="Move down 5"
      onClick={(e) => {
        e.stopPropagation();
        return fetchEndpoint(stepDownQueue, {}, { body: { conversationId: row.id, steps: 5 } });
      }}
    />
  );
}

/** Move the row's task-group to the bottom of the queue. */
export function DemoteAction({ row }: ItemActionProps<QueueRow>): ReactElement | null {
  if ((row.section !== "current" && row.section !== "queued") || row.isBottom) return null;
  return (
    <RowActionButton
      icon={MdVerticalAlignBottom}
      label="Move to bottom"
      onClick={(e) => {
        e.stopPropagation();
        return fetchEndpoint(demoteQueue, {}, { body: { conversationId: row.id } });
      }}
    />
  );
}

/** Seed a rank for an unranked (waiting) conversation, adding it to the queue. */
export function AddToQueueAction({ row }: ItemActionProps<QueueRow>): ReactElement | null {
  if (row.section !== "unranked") return null;
  return (
    <RowActionButton
      icon={MdOutlineQueue}
      label="Add to queue"
      onClick={(e) => {
        e.stopPropagation();
        return fetchEndpoint(rerankQueue, {}, { body: { conversationId: row.id } });
      }}
    />
  );
}

/** Close the conversation (all sections except Done). */
export function CloseAction({ row }: ItemActionProps<QueueRow>): ReactElement | null {
  const onCloseConversation = useContext(CloseConversationContext);
  if (row.section === "done" || !onCloseConversation) return null;
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
