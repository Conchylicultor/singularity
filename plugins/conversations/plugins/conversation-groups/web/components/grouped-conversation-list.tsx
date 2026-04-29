import { useMemo, useState, useCallback, type ReactNode } from "react";
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
import {
  conversationGroupsResource,
  type ConversationGroup,
  type ConversationGroupMember,
} from "../../shared";
import type { Conversation } from "@plugins/tasks-core/shared";
import { tasksResource } from "@plugins/tasks/shared";
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
import { MdClose, MdRemoveCircleOutline } from "react-icons/md";
import { cn } from "@/lib/utils";
import { DraggableRow, type DropTarget } from "./draggable-row";
import { GroupBox } from "./group-box";

type ConversationEntry = Conversation;
type AttemptGroup = ConversationEntry[]; // [root, ...forks]

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
  const groups: ConversationGroup[] = data?.groups ?? [];
  const members: ConversationGroupMember[] = data?.members ?? [];

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
    tasksData ?? [],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const allConversations = useMemo(
    () => [...active, ...system, ...recentGone, ...paginatedItems],
    [active, system, recentGone, paginatedItems],
  );
  const activeConv = useMemo(
    () => (activeConvId ? allConversations.find((c) => c.id === activeConvId) : null),
    [activeConvId, allConversations],
  );

  const onDragStart = useCallback((event: DragStartEvent) => {
    const convId = (event.active.data.current as { convId?: string } | null)?.convId;
    setActiveConvId(convId ?? null);
  }, []);

  const onDragEnd = async (event: DragEndEvent) => {
    setActiveConvId(null);
    const { active: activeDrag, over } = event;
    if (!over) return;
    const draggedId = (activeDrag.data.current as { convId?: string } | null)?.convId;
    const target = over.data.current as DropTarget | undefined;
    if (!draggedId || !target) return;
    if (target.kind === "conv" && target.convId === draggedId) return;

    if (target.kind === "auto-group") {
      // Promote the auto-group to a persistent user-defined group, adding the dragged conv.
      const convIds = [...target.rootConvIds];
      if (!convIds.includes(draggedId)) convIds.push(draggedId);
      await fetch(`/api/conversation-groups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: target.title, conversationIds: convIds }),
      });
      return;
    }

    if (target.kind === "group") {
      const currentGroupId = groupIdByConvId.get(draggedId);
      if (currentGroupId === target.groupId) return;
      await fetch(`/api/conversation-groups/${target.groupId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: draggedId }),
      });
      return;
    }

    // target.kind === "conv"
    const targetGroupId = groupIdByConvId.get(target.convId);
    if (targetGroupId) {
      const currentGroupId = groupIdByConvId.get(draggedId);
      if (currentGroupId === targetGroupId) return;
      await fetch(`/api/conversation-groups/${targetGroupId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: draggedId }),
      });
      return;
    }

    // Neither is grouped — create a new group containing both. Default title
    // pulls from the target conversation (the "anchor") to give the group a
    // recognizable name immediately.
    const anchor = active.find((c) => c.id === target.convId);
    const title = anchor?.title?.trim() || "Group";
    await fetch(`/api/conversation-groups`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        conversationIds: [target.convId, draggedId],
      }),
    });
  };

  const renderRow = (
    conv: ConversationEntry,
    forks: ConversationEntry[],
    enclosingGroupId?: string,
  ): ReactNode => (
    <DraggableRow key={conv.id} convId={conv.id} groupId={enclosingGroupId}>
      <SidebarMenuButton
        className={cn("h-auto py-1.5", rowTint(conv))}
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
      {forks.length > 0 && (
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
      )}
    </DraggableRow>
  );

  const renderAttemptGroup = (ag: AttemptGroup, enclosingGroupId?: string) => {
    const [root, ...forks] = ag;
    if (!root) return null;
    return renderRow(root, forks, enclosingGroupId);
  };

  return (
    <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveConvId(null)}>
      <div className="flex flex-col gap-1.5">
        {groups.map((g) => {
          const ags = groupedAttemptGroups.get(g.id) ?? [];
          return (
            <GroupBox
              key={g.id}
              group={g}
              isEmpty={ags.length === 0}
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
          );
        })}
        {autoGroups.map((ag) => (
          <AutoGroupBox
            key={ag.clusterKey}
            clusterKey={ag.clusterKey}
            title={ag.title}
            rootConvIds={ag.rootConvIds}
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
        <SidebarMenu>
          {trulyUngrouped.map((ag) => renderAttemptGroup(ag))}
          {recentGone.map((conv) => (
            <SidebarMenuItem key={conv.id}>
              <SidebarMenuButton
                className={cn("h-auto py-1.5", rowTint(conv))}
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
                className={cn("h-auto py-1.5", rowTint(conv))}
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
      <DragOverlay dropAnimation={null}>
        {activeConv ? (
          <div className="bg-background/90 border-accent flex items-center rounded border px-2 py-1.5 text-sm shadow-md">
            <ConversationItem conv={activeConv} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
