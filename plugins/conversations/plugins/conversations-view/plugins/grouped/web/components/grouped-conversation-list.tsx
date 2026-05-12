import { useMemo, useState, useCallback, Fragment, type ReactNode } from "react";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { conversationGroupsResource } from "../../shared";
import type { Conversation } from "@plugins/tasks-core/core";
import { tasksResource } from "@plugins/tasks/core";
import { useTaskAutoGroups } from "./use-task-auto-groups";
import { AutoGroupBox } from "./auto-group-box";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuAction,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
} from "@/components/ui/sidebar";
import { ConversationItem } from "@plugins/conversations/plugins/conversation-ui/plugins/item/web";
import { MdChevronRight, MdClose, MdFolder, MdRemoveCircleOutline } from "react-icons/md";
import { cn } from "@/lib/utils";
import { DraggableRow, type DropTarget } from "./draggable-row";
import { GroupBox } from "./group-box";
import { GroupContainer } from "./group-container";
import { GroupGapZone } from "./group-gap-zone";
import { NewGroupDropZone } from "./new-group-drop-zone";

type ConversationEntry = Conversation;
type AttemptGroup = ConversationEntry[]; // [root, ...forks]

const UNGROUPED_EXPANDED_KEY = "conv-groups:ungrouped:expanded";
const GONE_EXPANDED_KEY = "conv-groups:gone:expanded";

// Read the conv id from the draggable id, not event.active.data.current —
// dnd-kit's data ref can clear mid-drag if the row re-renders (live-state
// updates), but the id is captured at drag start and stays stable.
function parseConvDragId(id: string | number): string | null {
  if (typeof id !== "string" || !id.startsWith("conv-")) return null;
  return id.slice("conv-".length);
}

function parseGroupDragId(id: string | number): string | null {
  if (typeof id !== "string" || !id.startsWith("group-")) return null;
  return id.slice("group-".length);
}

export interface GroupedConversationListProps {
  active: ConversationEntry[];
  system: ConversationEntry[];
  showSystem: boolean;
  recentGone: ConversationEntry[];
  paginatedItems: ConversationEntry[];
  activeId: string | null;
  onNavigate: (id: string) => void;
  onCloseConversation: (id: string, e: React.MouseEvent) => void;
}

function rowTint(conv: ConversationEntry) {
  return conv.kind === "system" ? "bg-muted/30" : undefined;
}

export function GroupedConversationList(props: GroupedConversationListProps) {
  const {
    active,
    system,
    showSystem,
    recentGone,
    paginatedItems,
    activeId,
    onNavigate,
    onCloseConversation,
  } = props;

  const { data } = useResource(conversationGroupsResource);
  const { groups, members } = data;

  const groupIdByConvId = useMemo(() => {
    const m = new Map<string, string>();
    for (const mb of members) m.set(mb.conversationId, mb.groupId);
    return m;
  }, [members]);

  // Members come from the server already sorted by rank (asc).
  const memberConvIdsByGroupId = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const mb of members) {
      const list = m.get(mb.groupId) ?? [];
      list.push(mb.conversationId);
      m.set(mb.groupId, list);
    }
    return m;
  }, [members]);

  // Reproduce the existing fork-grouping: conversations sharing an attemptId
  // collapse into one display unit (root + forks), oldest-first within the
  // unit. Server feed is newest-first, so the first conversation seen per
  // attempt determines unit ordering.
  const attemptGroupsInOrder: AttemptGroup[] = useMemo(() => {
    const merged = showSystem ? [...active, ...system] : active;
    const map = new Map<string, ConversationEntry[]>();
    for (const c of merged) {
      const list = map.get(c.attemptId) ?? [];
      list.push(c);
      map.set(c.attemptId, list);
    }
    return Array.from(map.values()).map((g) =>
      [...g].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
    );
  }, [active, system, showSystem]);

  const attemptGroupByRootConvId = useMemo(() => {
    const m = new Map<string, AttemptGroup>();
    for (const ag of attemptGroupsInOrder) {
      const root = ag[0];
      if (root) m.set(root.id, ag);
    }
    return m;
  }, [attemptGroupsInOrder]);

  // Partition into per-user-group buckets and an ungrouped tail.
  const groupedAttemptGroups = useMemo(() => {
    const m = new Map<string, AttemptGroup[]>();
    for (const g of groups) {
      const ids = memberConvIdsByGroupId.get(g.id) ?? [];
      const ags: AttemptGroup[] = [];
      for (const convId of ids) {
        const ag = attemptGroupByRootConvId.get(convId);
        if (ag) ags.push(ag);
      }
      m.set(g.id, ags);
    }
    return m;
  }, [groups, memberConvIdsByGroupId, attemptGroupByRootConvId]);

  const ungroupedAttemptGroups = useMemo(
    () =>
      attemptGroupsInOrder.filter((ag) => {
        const root = ag[0];
        return root ? !groupIdByConvId.has(root.id) : false;
      }),
    [attemptGroupsInOrder, groupIdByConvId],
  );

  const { data: tasksData } = useResource(tasksResource);
  const { autoGroups, trulyUngrouped } = useTaskAutoGroups(
    ungroupedAttemptGroups,
    tasksData,
  );

  const hasActiveInGroup = (ags: AttemptGroup[]) =>
    !!activeId && ags.some((ag) => ag.some((conv) => conv.id === activeId));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  // Map from rootConvId → all rootConvIds in the same auto-group cluster.
  // Captured at drag-start so live-state updates mid-drag don't change the set.
  const convIdToAutoGroupRootConvIds = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const ag of autoGroups) {
      for (const convId of ag.rootConvIds) {
        m.set(convId, ag.rootConvIds);
      }
    }
    return m;
  }, [autoGroups]);

  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  // All rootConvIds in the same auto-group as the dragged conv (includes the dragged conv itself).
  // Empty array when the dragged conv is not in any auto-group.
  const [activeSiblingConvIds, setActiveSiblingConvIds] = useState<string[]>([]);
  const [pendingFocusGroupId, setPendingFocusGroupId] = useState<string | null>(
    null,
  );
  const [ungroupedExpanded, setUngroupedExpanded] = useState<boolean>(() => {
    try {
      return localStorage.getItem(UNGROUPED_EXPANDED_KEY) !== "0";
    } catch {
      return true;
    }
  });
  const toggleUngroupedExpanded = useCallback(() => {
    setUngroupedExpanded((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(UNGROUPED_EXPANDED_KEY, next ? "1" : "0");
      } catch {}
      return next;
    });
  }, []);

  const [goneExpanded, setGoneExpanded] = useState<boolean>(() => {
    try {
      return localStorage.getItem(GONE_EXPANDED_KEY) !== "0";
    } catch {
      return true;
    }
  });
  const toggleGoneExpanded = useCallback(() => {
    setGoneExpanded((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(GONE_EXPANDED_KEY, next ? "1" : "0");
      } catch {}
      return next;
    });
  }, []);
  const dragInProgress = activeConvId !== null || activeGroupId !== null;
  const allConversations = useMemo(
    () => [...active, ...system, ...recentGone, ...paginatedItems],
    [active, system, recentGone, paginatedItems],
  );
  const activeConv = useMemo(
    () => (activeConvId ? allConversations.find((c) => c.id === activeConvId) : null),
    [activeConvId, allConversations],
  );

  const onDragStart = useCallback(
    (event: DragStartEvent) => {
      const groupId = parseGroupDragId(event.active.id);
      if (groupId) {
        setActiveGroupId(groupId);
        return;
      }
      const convId = parseConvDragId(event.active.id);
      setActiveConvId(convId);
      // Capture sibling IDs at drag start — stable across live-state updates during drag.
      setActiveSiblingConvIds(convId ? (convIdToAutoGroupRootConvIds.get(convId) ?? []) : []);
    },
    [convIdToAutoGroupRootConvIds],
  );

  const onDragEnd = async (event: DragEndEvent) => {
    const { active: activeDrag, over } = event;

    // Group reorder path — must run before conv logic clears state.
    const draggedGroupId = parseGroupDragId(activeDrag.id);
    if (draggedGroupId !== null) {
      setActiveGroupId(null);
      if (!over) return;
      const target = over.data.current as DropTarget | undefined;
      if (!target || target.kind !== "group-gap") return;
      const { prevGroupId, nextGroupId } = target;
      // no-op: dropping at a gap immediately adjacent to itself
      if (prevGroupId === draggedGroupId || nextGroupId === draggedGroupId) return;
      const prevRank = prevGroupId ? (groups.find((g) => g.id === prevGroupId)?.rank ?? null) : null;
      const nextRank = nextGroupId ? (groups.find((g) => g.id === nextGroupId)?.rank ?? null) : null;
      const newRank = Rank.between(prevRank, nextRank);
      await fetch(`/api/conversation-groups/${draggedGroupId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rank: newRank }),
      });
      return;
    }

    const capturedSiblings = activeSiblingConvIds;
    setActiveConvId(null);
    setActiveSiblingConvIds([]);
    if (!over) return;
    const draggedId = parseConvDragId(activeDrag.id);
    const target = over.data.current as DropTarget | undefined;
    if (!draggedId || !target) return;
    if (target.kind === "conv" && target.convId === draggedId) return;

    // When the dragged conv belongs to an auto-group cluster, all siblings move
    // together. Fall back to just the dragged conv for manually grouped or solo convs.
    const idsToMove = capturedSiblings.length > 0 ? capturedSiblings : [draggedId];

    if (target.kind === "new-group") {
      const res = await fetch(`/api/conversation-groups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationIds: idsToMove }),
      });
      if (res.ok) {
        const created = (await res.json()) as { id?: string };
        if (created.id) setPendingFocusGroupId(created.id);
      }
      return;
    }

    if (target.kind === "ungroup") {
      // Remove every sibling that is currently in a user group.
      await Promise.all(
        idsToMove
          .filter((id) => groupIdByConvId.has(id))
          .map((id) =>
            fetch(`/api/conversation-groups/members/${id}`, { method: "DELETE" }),
          ),
      );
      return;
    }

    if (target.kind === "auto-group") {
      // Promote the auto-group to a persistent user-defined group, adding all siblings.
      const convIds = [...target.rootConvIds];
      for (const id of idsToMove) {
        if (!convIds.includes(id)) convIds.push(id);
      }
      await fetch(`/api/conversation-groups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: target.title, conversationIds: convIds }),
      });
      return;
    }

    if (target.kind === "group") {
      // If all siblings are already in this group, nothing to do.
      if (idsToMove.every((id) => groupIdByConvId.get(id) === target.groupId)) return;
      await fetch(`/api/conversation-groups/${target.groupId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationIds: idsToMove }),
      });
      return;
    }

    if (target.kind !== "conv") return;

    // target.kind === "conv"
    const targetGroupId = groupIdByConvId.get(target.convId);
    if (targetGroupId) {
      if (idsToMove.every((id) => groupIdByConvId.get(id) === targetGroupId)) return;
      await fetch(`/api/conversation-groups/${targetGroupId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationIds: idsToMove }),
      });
      return;
    }

    // Neither is in a user group — create a new group containing both the
    // target and all siblings. Default title pulls from the target conversation.
    const anchor = active.find((c) => c.id === target.convId);
    const title = anchor?.title?.trim() || "Group";
    const newGroupIds = [target.convId, ...idsToMove.filter((id) => id !== target.convId)];
    await fetch(`/api/conversation-groups`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, conversationIds: newGroupIds }),
    });
  };

  const renderRow = (
    conv: ConversationEntry,
    forks: ConversationEntry[],
    enclosingGroupId?: string,
  ): ReactNode => (
    <DraggableRow
      key={conv.id}
      convId={conv.id}
      groupId={enclosingGroupId}
      row={
        <>
          <SidebarMenuButton
            className={cn("h-auto py-2", rowTint(conv))}
            isActive={conv.id === activeId}
            onClick={() => onNavigate(conv.id)}
          >
            <ConversationItem conv={conv} />
          </SidebarMenuButton>
          {enclosingGroupId !== undefined && (
            <SidebarMenuAction
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                void fetch(`/api/conversation-groups/members/${conv.id}`, {
                  method: "DELETE",
                });
              }}
              className="right-7 opacity-0 group-hover/menu-item:opacity-100"
              aria-label="Remove from group"
              title="Remove from group"
            >
              <MdRemoveCircleOutline className="size-3.5" />
            </SidebarMenuAction>
          )}
          <SidebarMenuAction
            onClick={(e: React.MouseEvent) => onCloseConversation(conv.id, e)}
            className="opacity-0 group-hover/menu-item:opacity-100"
            aria-label="Close conversation"
          >
            <MdClose className="size-3.5" />
          </SidebarMenuAction>
        </>
      }
      forks={
        forks.length > 0 ? (
          <SidebarMenuSub>
            {forks.map((fork) => (
              <SidebarMenuSubItem key={fork.id} className="relative group/menu-item">
                <SidebarMenuSubButton
                  className={cn("h-auto py-1", rowTint(fork))}
                  isActive={fork.id === activeId}
                  onClick={() => onNavigate(fork.id)}
                >
                  <ConversationItem conv={fork} />
                </SidebarMenuSubButton>
                <SidebarMenuAction
                  onClick={(e: React.MouseEvent) => onCloseConversation(fork.id, e)}
                  className="opacity-0 group-hover/menu-item:opacity-100"
                  aria-label="Close conversation"
                >
                  <MdClose className="size-3.5" />
                </SidebarMenuAction>
              </SidebarMenuSubItem>
            ))}
          </SidebarMenuSub>
        ) : null
      }
    />
  );

  const renderAttemptGroup = (ag: AttemptGroup, enclosingGroupId?: string) => {
    const [root, ...forks] = ag;
    if (!root) return null;
    return renderRow(root, forks, enclosingGroupId);
  };

  return (
    <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => { setActiveConvId(null); setActiveGroupId(null); setActiveSiblingConvIds([]); }}>
      <div className="flex flex-col gap-1.5">
        <NewGroupDropZone visible={dragInProgress} />
        {groups.map((g, i) => {
          const ags = groupedAttemptGroups.get(g.id) ?? [];
          return (
            <Fragment key={g.id}>
              <GroupGapZone
                prevGroupId={i === 0 ? null : (groups[i - 1]?.id ?? null)}
                nextGroupId={g.id}
                visible={activeGroupId !== null}
              />
              <GroupBox
                group={g}
                isEmpty={ags.length === 0}
                count={ags.length}
                dragInProgress={dragInProgress}
                hasActiveChild={hasActiveInGroup(ags)}
                autoFocusRename={pendingFocusGroupId === g.id}
                onRenameFocused={() => setPendingFocusGroupId(null)}
                onRename={async (next) => {
                  await fetch(`/api/conversation-groups/${g.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ title: next }),
                  });
                }}
                onToggleExpanded={async (next) => {
                  await fetch(`/api/conversation-groups/${g.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ expanded: next }),
                  });
                }}
                onDelete={async () => {
                  await fetch(`/api/conversation-groups/${g.id}`, {
                    method: "DELETE",
                  });
                }}
              >
                <SidebarMenu>
                  {ags.map((ag) => renderAttemptGroup(ag, g.id))}
                </SidebarMenu>
              </GroupBox>
            </Fragment>
          );
        })}
        {groups.length > 0 && (
          <GroupGapZone
            prevGroupId={groups[groups.length - 1]?.id ?? null}
            nextGroupId={null}
            visible={activeGroupId !== null}
          />
        )}
        {autoGroups.map((ag) => (
          <AutoGroupBox
            key={ag.clusterKey}
            clusterKey={ag.clusterKey}
            title={ag.title}
            rootConvIds={ag.rootConvIds}
            dragInProgress={dragInProgress}
            hasActiveChild={hasActiveInGroup(ag.attemptGroups)}
            onRename={async (next) => {
              await fetch(`/api/conversation-groups`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title: next, conversationIds: ag.rootConvIds }),
              });
            }}
          >
            <SidebarMenu>
              {ag.attemptGroups.map((attemptGroup) => renderAttemptGroup(attemptGroup))}
            </SidebarMenu>
          </AutoGroupBox>
        ))}
        <GroupContainer
          droppableId="drop-ungrouped"
          dropData={{ kind: "ungroup" }}
          expanded={ungroupedExpanded}
          onToggleExpanded={toggleUngroupedExpanded}
          dragInProgress={dragInProgress}
          hasActiveChild={hasActiveInGroup(trulyUngrouped)}
          count={trulyUngrouped.length}
          title={
            <div className="min-w-0 flex-1 truncate px-1 py-0.5 text-xs font-semibold text-muted-foreground">
              Ungrouped
            </div>
          }
        >
          {trulyUngrouped.length > 0 ? (
            <SidebarMenu>
              {trulyUngrouped.map((ag) => renderAttemptGroup(ag))}
            </SidebarMenu>
          ) : (
            <div className="px-2 py-1 text-[11px] text-muted-foreground italic">
              No ungrouped conversations
            </div>
          )}
        </GroupContainer>
        {(recentGone.length > 0 || paginatedItems.length > 0) && (
          <div className="rounded-md transition-colors hover:bg-muted/30">
            <div className="flex items-center gap-0.5 rounded-md px-1 py-1">
              <button
                type="button"
                onClick={toggleGoneExpanded}
                aria-label={goneExpanded ? "Collapse closed" : "Expand closed"}
                className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent"
              >
                <MdChevronRight
                  className={cn(
                    "size-4 transition-transform",
                    !dragInProgress && goneExpanded && "rotate-90",
                  )}
                />
              </button>
              <div className="min-w-0 flex-1 truncate px-1 py-0.5 text-xs font-semibold text-muted-foreground">
                Closed
              </div>
            </div>
            {!dragInProgress && goneExpanded && (
              <div className="mt-0.5 pl-1">
                <SidebarMenu>
                  {recentGone.map((conv) => (
                    <SidebarMenuItem key={conv.id}>
                      <SidebarMenuButton
                        className={cn("h-auto py-2", rowTint(conv))}
                        isActive={conv.id === activeId}
                        onClick={() => onNavigate(conv.id)}
                      >
                        <ConversationItem conv={conv} />
                      </SidebarMenuButton>
                      <SidebarMenuAction
                        onClick={(e: React.MouseEvent) => onCloseConversation(conv.id, e)}
                        className="opacity-0 group-hover/menu-item:opacity-100"
                      >
                        <MdClose className="size-3.5" />
                      </SidebarMenuAction>
                    </SidebarMenuItem>
                  ))}
                  {paginatedItems.map((conv) => (
                    <SidebarMenuItem key={conv.id}>
                      <SidebarMenuButton
                        className={cn("h-auto py-2", rowTint(conv))}
                        isActive={conv.id === activeId}
                        onClick={() => onNavigate(conv.id)}
                      >
                        <ConversationItem conv={conv} />
                      </SidebarMenuButton>
                      <SidebarMenuAction
                        onClick={(e: React.MouseEvent) => onCloseConversation(conv.id, e)}
                        className="opacity-0 group-hover/menu-item:opacity-100"
                      >
                        <MdClose className="size-3.5" />
                      </SidebarMenuAction>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </div>
            )}
          </div>
        )}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeGroupId ? (
          <div className="bg-background/90 border-accent flex items-center gap-1.5 rounded border px-2 py-1.5 text-sm font-medium shadow-md">
            <MdFolder className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">
              {groups.find((g) => g.id === activeGroupId)?.title || "Group"}
            </span>
          </div>
        ) : activeConv ? (
          <div className="bg-background/90 border-accent flex items-center rounded border px-2 py-1.5 text-sm shadow-md">
            <ConversationItem conv={activeConv} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
