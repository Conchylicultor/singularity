import { type ReactElement } from "react";
import { DataView, defineDataView } from "@plugins/primitives/plugins/data-view/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { ConversationItem } from "@plugins/conversations/plugins/conversation-ui/plugins/item/web";
import type { ConversationSidebarProps } from "@plugins/conversations/plugins/conversations-view/plugins/data-view/web";
import { useQueueRows, type QueueRow } from "./use-queue-rows";
import { queueFields } from "./queue-fields";
import { QueueItemActions, CloseConversationContext } from "./queue-item-actions";

// The DataView surface id — the config lives under this plugin's tree at
// `config/conversations/conversations-view/data-view/queue/conversations-sidebar-queue.jsonc`.
const SIDEBAR_QUEUE_VIEW = defineDataView("conversations-sidebar-queue");

/**
 * The Queue tab of the `dataview` sidebar variant: the priority queue rebuilt on
 * the official DataView primitive, reusing the queue's live data + mutation layer
 * unchanged. Rows carry a synthetic `section` field (default group-by) so the
 * classic status sections render as group-by sections; `manualOrder` drives the
 * neighbor-based `reorderQueue` drag; `aggregate` collapses task-groups (in the
 * ranked/working sections) to one representative + `×N` badge.
 *
 * Wrapped in `<Scroll axis="y" fill>` because the mount point renders the region
 * inside a `<Column scrollBody={false}>` — the DataView never owns a scroller and
 * needs this single scroll ancestor for row rendering.
 */
export function SidebarQueueBody({
  activeId,
  onNavigate,
  onCloseConversation,
}: ConversationSidebarProps): ReactElement {
  const { rows, dispatchReorder, pending } = useQueueRows();

  return (
    <CloseConversationContext.Provider value={onCloseConversation}>
      <Scroll axis="y" fill className="h-full">
        <DataView<QueueRow>
          storageKey={SIDEBAR_QUEUE_VIEW}
          rows={rows}
          fields={queueFields}
          rowKey={(c) => c.id}
          views={["list"]}
          loading={pending}
          selectedRowId={activeId ?? undefined}
          onRowActivate={(r) => onNavigate(r.id)}
          viewOptions={{
            list: {
              renderRow: (c: QueueRow) => <ConversationItem conv={c} layout="block" />,
            },
          }}
          itemActions={QueueItemActions}
          aggregate={{
            getKey: (r) =>
              r.section === "current" || r.section === "queued" || r.section === "working"
                ? r.taskId
                : null,
            pickRepresentative: (m) =>
              m.find((x) => x.status === "working" || x.status === "starting") ??
              m.reduce((a, b) => (b.createdAt > a.createdAt ? b : a)),
          }}
          manualOrder={{
            getRank: (r) => r.rank,
            onMove: (id, dest) => {
              if (!dest.targetId || !dest.zone) return;
              if (dest.targetId === id) return;
              dispatchReorder({ conversationId: id, targetId: dest.targetId, zone: dest.zone });
            },
          }}
        />
      </Scroll>
    </CloseConversationContext.Provider>
  );
}
