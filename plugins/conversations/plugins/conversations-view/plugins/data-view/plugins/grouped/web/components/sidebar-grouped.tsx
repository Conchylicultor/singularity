import { useCallback, useMemo, type ReactElement, type ReactNode } from "react";
import { MdCallMerge, MdFolder } from "react-icons/md";
import { DataView, defineDataView } from "@plugins/primitives/plugins/data-view/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Inline } from "@plugins/primitives/plugins/css/plugins/inline/web";
import { computeFlatReorder } from "@plugins/primitives/plugins/rank/core";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { ConversationItem } from "@plugins/conversations/plugins/conversation-ui/plugins/item/web";
import type { HierarchyConfig } from "@plugins/primitives/plugins/data-view/web";
import type { ConversationSidebarProps } from "@plugins/conversations/plugins/conversations-view/plugins/data-view/web";
import {
  addConversationGroupMembers,
  createConversationGroup,
  moveConversationGroupMember,
  patchConversationGroup,
  removeConversationGroupMember,
} from "@plugins/conversations/plugins/conversations-view/plugins/grouped/core";
import {
  BUCKET_UNGROUPED,
  useGroupedRows,
  type GroupedRow,
} from "./use-grouped-rows";
import { groupedFields } from "./grouped-fields";
import { GroupedItemActions, CloseConversationContext } from "./grouped-item-actions";

// The DataView surface id — the config lives under this plugin's tree at
// `config/conversations/conversations-view/data-view/grouped/conversations-sidebar-grouped.jsonc`.
const SIDEBAR_GROUPED_VIEW = defineDataView("conversations-sidebar-grouped");

/**
 * The Grouped tab of the `dataview` sidebar variant: user-defined conversation
 * groups rendered as a DataView **tree** (`group → conversations`, both ranked)
 * over the grouped plugin's live data + mutation layer, unchanged.
 *
 * Wrapped in `<Scroll axis="y" fill>` because the mount point renders the region
 * inside a `<Column scrollBody={false}>` — the DataView never owns a scroller and
 * needs this single scroll ancestor for row rendering.
 */
export function SidebarGroupedBody({
  activeId,
  onNavigate,
  onCloseConversation,
}: ConversationSidebarProps): ReactElement {
  const { rows, groups, rowById, autoGroupSiblings, setLocalExpanded, pending } =
    useGroupedRows();

  // The group/auto-group/bucket row the ACTIVE conversation lives under — the
  // collapsed-with-active-child tint (classic's `hasActiveChild`). Walk up
  // through a fork's root conversation to its enclosing container.
  const activeContainerId = useMemo(() => {
    if (!activeId) return null;
    let cur = rowById.get(activeId);
    while (cur?.parentId != null) {
      const parent = rowById.get(cur.parentId);
      if (!parent) return null;
      if (parent.kind !== "conv") return parent.id;
      cur = parent;
    }
    return null;
  }, [activeId, rowById]);

  const onToggleExpanded = useCallback(
    async (id: string, next: boolean): Promise<void> => {
      const row = rowById.get(id);
      if (!row) return;
      // A user group's expand state is server-persisted; the derived rows
      // (auto-groups, buckets) have no DB row to carry it — device-local.
      if (row.kind === "group") {
        await fetchEndpoint(patchConversationGroup, { id }, { body: { expanded: next } });
        return;
      }
      if (row.kind === "auto-group" || row.kind === "bucket") {
        setLocalExpanded(id, next);
      }
    },
    [rowById, setLocalExpanded],
  );

  /**
   * The whole drag surface. The tree owns the drop **geometry**, this owns its
   * **meaning**: a whole-row ("child") drop arrives as `targetId: null` + the drop
   * target's id in `parentId`; an edge drop arrives with `targetId` set and
   * `parentId` = the target's parent. That single distinction reproduces classic's
   * entire `DropTarget` union.
   *
   * Everything is endpoint-based (`targetId`/`zone`) — `dest.rank` is computed
   * over a projection full of minted synthetic ranks and is never a valid storage
   * key. Group reorder is the sole exception: this consumer holds the complete,
   * unfiltered `groups` list, so it resolves that rank itself (exactly as classic
   * does), against `groups` — never `dest.rank`.
   */
  const onMove = useCallback(
    async (
      id: string,
      dest: { parentId: string | null; targetId: string | null; zone: "before" | "after" },
    ): Promise<void> => {
      const row = rowById.get(id);
      if (!row) return;

      // --- group reorder: an edge drop at the root beside another group row ---
      if (row.kind === "group") {
        if (dest.targetId === null) return;
        if (rowById.get(dest.targetId)?.kind !== "group") return; // only groups are ordered
        const rank = computeFlatReorder(groups, id, dest.zone, dest.targetId);
        if (rank === null) return;
        await fetchEndpoint(patchConversationGroup, { id }, { body: { rank } });
        return;
      }

      // Only root conversations are group members; forks follow their root, and
      // the container rows have no membership of their own.
      if (row.kind !== "conv") return;

      // Classic's "drag one, move the cluster": an auto-grouped conversation
      // drags its whole cluster. Read at drop time — `HierarchyConfig` exposes no
      // drag-start seam, so the drag-start capture classic did is not expressible;
      // the live set is at worst fresher than the captured one.
      const ids = autoGroupSiblings.get(id) ?? [id];
      /** The user group a conversation row currently belongs to, or null. */
      const groupIdOf = (convId: string): string | null => {
        const r = rowById.get(convId);
        return r?.kind === "conv" ? r.groupId : null;
      };
      const allAlreadyIn = (groupId: string): boolean =>
        ids.every((x) => groupIdOf(x) === groupId);

      // --- root: an edge drop between containers → a new group holding the cluster ---
      if (dest.parentId === null) {
        await fetchEndpoint(createConversationGroup, {}, { body: { conversationIds: ids } });
        return;
      }
      const parent = rowById.get(dest.parentId);
      if (!parent) return;

      // --- member reorder: an edge drop beside a member of a user group ---
      // The ONLY ordered sibling set a conversation lives in. The rank is
      // resolved server-side against the complete member set.
      if (dest.targetId !== null && parent.kind === "group") {
        await fetchEndpoint(
          moveConversationGroupMember,
          { conversationId: id },
          { body: { targetId: dest.targetId, zone: dest.zone } },
        );
        // A positioned drop names ONE neighbour, so it can only place the dragged
        // conversation. The rest of its auto-group cluster still joins the group
        // (appended) — the cluster rule and the position are composed, not traded.
        const rest = ids.filter((x) => x !== id && groupIdOf(x) !== parent.id);
        if (rest.length > 0) {
          await fetchEndpoint(
            addConversationGroupMembers,
            { id: parent.id },
            { body: { conversationIds: rest } },
          );
        }
        return;
      }

      // --- everything else resolves by DESTINATION PARENT ---
      // An edge drop into an unordered container (Ungrouped, an auto-group, or
      // beside a fork) carries no order to persist, so it means exactly what a
      // whole-row drop on that container means.
      switch (parent.kind) {
        case "group": {
          // No-op when the whole cluster is already in this group.
          if (allAlreadyIn(parent.id)) return;
          await fetchEndpoint(
            addConversationGroupMembers,
            { id: parent.id },
            { body: { conversationIds: ids } },
          );
          return;
        }
        case "auto-group": {
          // Promote the derived cluster to a real group, adding the dragged set.
          const conversationIds = [...parent.rootConvIds];
          for (const x of ids) if (!conversationIds.includes(x)) conversationIds.push(x);
          await fetchEndpoint(
            createConversationGroup,
            {},
            { body: { title: parent.title, conversationIds } },
          );
          return;
        }
        case "bucket": {
          if (parent.id !== BUCKET_UNGROUPED) return; // Closed is not joinable
          // Bulk-ungroup: detach every member of the cluster that is grouped.
          await Promise.all(
            ids
              .filter((x) => groupIdOf(x) !== null)
              .map((x) =>
                fetchEndpoint(removeConversationGroupMember, { conversationId: x }),
              ),
          );
          return;
        }
        case "conv": {
          // Dropped onto a conversation. In a group → join it (classic's
          // drop-on-a-member trick). Otherwise → create a group from both,
          // titled after the target (classic's default).
          if (parent.groupId !== null) {
            if (allAlreadyIn(parent.groupId)) return;
            await fetchEndpoint(
              addConversationGroupMembers,
              { id: parent.groupId },
              { body: { conversationIds: ids } },
            );
            return;
          }
          const title = parent.conv.title?.trim() || "Group";
          const conversationIds = [parent.id, ...ids.filter((x) => x !== parent.id)];
          await fetchEndpoint(
            createConversationGroup,
            {},
            { body: { title, conversationIds } },
          );
          return;
        }
        case "fork":
          // A fork is not a container of its own — only root conversations are
          // group members, so there is nothing a drop onto one could mean.
          return;
      }
    },
    [rowById, groups, autoGroupSiblings],
  );

  const hierarchy = useMemo<HierarchyConfig<GroupedRow>>(
    () => ({
      getParentId: (r) => r.parentId,
      getRank: (r) => r.rank,
      isExpanded: (r) => (r.kind === "conv" || r.kind === "fork" ? true : r.expanded),
      onToggleExpanded,
      onMove,
      // The tree's native create affordance replaces classic's dashed
      // "drop here to create a group" zone: it mints an EMPTY group and the
      // returned id auto-opens its label into rename (pending-focus).
      onCreate: async () =>
        (await fetchEndpoint(createConversationGroup, {}, { body: { conversationIds: [] } }))
          .id,
    }),
    [onToggleExpanded, onMove],
  );

  const viewOptions = useMemo(
    () => ({
      tree: {
        addLabel: "New group",
        leadingIcon: (r: GroupedRow): ReactNode => {
          if (r.kind === "group") return <MdFolder className="size-3.5 text-muted-foreground" />;
          if (r.kind === "auto-group")
            return <MdCallMerge className="size-3.5 text-muted-foreground" />;
          return null;
        },
        trailing: (r: GroupedRow): ReactNode =>
          r.kind === "group" && r.count > 0 ? <Badge>{r.count}</Badge> : null,
        rowAccent: (r: GroupedRow): ReactNode => {
          // A collapsed container holding the active conversation.
          if (r.id === activeContainerId && "expanded" in r && !r.expanded) {
            return <div className="size-full rounded-md bg-sidebar-accent/50" />;
          }
          // System conversations read as chrome, not work.
          if ((r.kind === "conv" || r.kind === "fork") && r.conv.kind === "system") {
            return <div className="size-full rounded-md bg-muted/30" />;
          }
          return null;
        },
        dragOverlay: (r: GroupedRow): ReactNode =>
          r.kind === "conv" || r.kind === "fork" ? (
            <ConversationItem conv={r.conv} layout="inline" />
          ) : (
            <Inline gap="xs">
              <MdFolder className="size-3.5 text-muted-foreground" />
              <Text as="span" variant="label">
                {r.title}
              </Text>
            </Inline>
          ),
      },
    }),
    [activeContainerId],
  );

  return (
    <CloseConversationContext.Provider value={onCloseConversation}>
      <Scroll axis="y" fill className="h-full">
        <DataView<GroupedRow>
          storageKey={SIDEBAR_GROUPED_VIEW}
          rows={rows}
          fields={groupedFields}
          rowKey={(r) => r.id}
          views={["tree"]}
          loading={pending}
          selectedRowId={activeId ?? undefined}
          onRowActivate={(r) => {
            if (r.kind === "conv" || r.kind === "fork") onNavigate(r.id);
          }}
          itemActions={GroupedItemActions}
          hierarchy={hierarchy}
          viewOptions={viewOptions}
        />
      </Scroll>
    </CloseConversationContext.Provider>
  );
}
