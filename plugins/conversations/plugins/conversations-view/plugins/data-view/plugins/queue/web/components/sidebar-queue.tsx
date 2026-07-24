import { type ReactElement } from "react";
import type { DataViewSourceProps } from "@plugins/primitives/plugins/data-view/web";
import { ConversationItem } from "@plugins/conversations/plugins/conversation-ui/plugins/item/web";
import type { ConversationSidebarProps } from "@plugins/conversations/plugins/conversations-view/plugins/data-view/web";
import { useQueueRows, type QueueRow } from "./use-queue-rows";
import { queueFields } from "./queue-fields";
import { QueueItemActions, CloseConversationContext } from "./queue-item-actions";

/**
 * The Queue source of the merged conversation-sidebar DataView: the priority
 * queue's live data + mutation layer handed to the shared surface as a source
 * bundle. Rows carry a synthetic `section` field (default group-by) so the
 * classic status sections render as group-by sections; `manualOrder` drives the
 * neighbor-based `reorderQueue` drag; `aggregate` collapses task-groups (in the
 * ranked/working sections) to one representative + `×N` badge.
 *
 * `render(bundle)` is ALWAYS called (loading rides in the bundle) so the
 * surface chrome never vanishes while the queue resource is pending.
 */
export function QueueSource({
  hostProps,
  render,
}: DataViewSourceProps<ConversationSidebarProps>): ReactElement {
  const { activeId, onNavigate, onCloseConversation } = hostProps;
  const { rows, dispatchReorder, pending } = useQueueRows();

  return (
    <CloseConversationContext.Provider value={onCloseConversation}>
      {render<QueueRow>({
        rows,
        fields: queueFields,
        rowKey: (c) => c.id,
        loading: pending,
        selectedRowId: activeId ?? undefined,
        onRowActivate: (r) => onNavigate(r.id),
        viewOptions: {
          list: {
            renderRow: (c: QueueRow) => <ConversationItem conv={c} layout="block" />,
          },
        },
        itemActions: QueueItemActions,
        aggregate: {
          getKey: (r) =>
            r.section === "current" || r.section === "queued" || r.section === "working"
              ? r.taskId
              : null,
          pickRepresentative: (m) =>
            m.find((x) => x.status === "working" || x.status === "starting") ??
            m.reduce((a, b) => (b.createdAt > a.createdAt ? b : a)),
        },
        manualOrder: {
          getRank: (r) => r.rank,
          onMove: (id, dest) => {
            if (!dest.targetId || !dest.zone) return;
            if (dest.targetId === id) return;
            dispatchReorder({ conversationId: id, targetId: dest.targetId, zone: dest.zone });
          },
        },
      })}
    </CloseConversationContext.Provider>
  );
}
