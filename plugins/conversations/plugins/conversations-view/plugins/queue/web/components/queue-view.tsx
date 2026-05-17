import { useCallback, useMemo, useState, type ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { MdClose, MdKeyboardDoubleArrowDown, MdOutlineQueue, MdVerticalAlignBottom, MdVerticalAlignTop } from "react-icons/md";
import { CollapsibleChevron } from "@plugins/primitives/plugins/collapsible/web";
import { useConversations } from "@plugins/conversations/web";
import type { ViewProps } from "@plugins/conversations/plugins/conversations-view/web";
import { ConversationItem } from "@plugins/conversations/plugins/conversation-ui/plugins/item/web";
import type { Conversation } from "@plugins/tasks-core/core";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { queueRanksResource } from "../../shared/resources";
import { tasksResource } from "@plugins/tasks/core";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import {
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

type RankedConversation = Conversation & { rank: Rank };

type TaskGroup = {
  taskId: string;
  selected: RankedConversation;
  members: RankedConversation[];
  count: number;
};

type DropData = { zone: "before" | "after"; targetId: string };

function parseDragId(id: string | number): string | null {
  if (typeof id !== "string" || !id.startsWith("queue-conv-")) return null;
  return id.slice("queue-conv-".length);
}

async function queuePost(path: string, body: Record<string, unknown>) {
  await fetch(`/api/conversations-queue/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const WORKING_EXPANDED_KEY = "queue-view:working:expanded";
const QUEUE_EXPANDED_KEY = "queue-view:queue:expanded";
const UNRANKED_EXPANDED_KEY = "queue-view:unranked:expanded";
const DISCONNECTED_EXPANDED_KEY = "queue-view:disconnected:expanded";
const GONE_EXPANDED_KEY = "queue-view:gone:expanded";

const SECTION_H = 28;

function SectionHeader({
  title,
  count,
  expanded,
  onToggleExpanded,
  stickyTop,
}: {
  title: string;
  count: number;
  expanded: boolean;
  onToggleExpanded: () => void;
  stickyTop: number;
}) {
  return (
    <div
      className="group/header sticky z-20 flex items-center gap-0.5 rounded-md bg-sidebar px-1 py-1"
      style={{ top: stickyTop }}
    >
      <button
        type="button"
        onClick={onToggleExpanded}
        aria-expanded={expanded}
        aria-label={expanded ? `Collapse ${title}` : `Expand ${title}`}
        className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent"
      >
        <CollapsibleChevron open={expanded} className="size-4" />
      </button>
      <div className="min-w-0 flex-1 truncate px-1 py-0.5 text-xs font-semibold text-muted-foreground">
        {title}
      </div>
      {count > 0 && (
        <span className="shrink-0 rounded px-1 py-0.5 text-[10px] tabular-nums text-muted-foreground opacity-0 transition-opacity group-hover/header:opacity-100">
          {count}
        </span>
      )}
    </div>
  );
}

export function QueueView({
  activeId,
  onNavigate,
  onCloseConversation,
}: ViewProps) {
  const { active, recentGone, isLoading } = useConversations();
  const queueResult = useResource(queueRanksResource);
  const queueData = queueResult.pending ? { ranks: [], pinnedConversationId: null } : queueResult.data;
  const rankRows = queueData.ranks;
  const pinnedConversationId = queueData.pinnedConversationId;
  const tasksResult = useResource(tasksResource);

  // Unified task-group logic across all statuses.
  const { waitingGroups, workingGroups, allWaitingCount, blockedIds, unranked } = useMemo(() => {
    const ranks = new Map(rankRows.map((r) => [r.conversationId, r.rank]));
    const taskRows = tasksResult.pending ? [] : tasksResult.data;
    const taskStatusMap = new Map(taskRows.map((t) => [t.id, t.status]));
    const ranked: RankedConversation[] = [];
    const blocked = new Set<string>();
    const noRank: Conversation[] = [];

    for (const c of active) {
      if (c.status !== "waiting" && c.status !== "working" && c.status !== "starting") continue;
      if (taskStatusMap.get(c.taskId) === "blocked") {
        blocked.add(c.id);
      }
      const rank = ranks.get(c.id);
      if (rank) {
        ranked.push({ ...c, rank });
      } else if (c.status === "waiting") {
        noRank.push(c);
      }
    }
    ranked.sort((a, b) => Rank.compare(a.rank, b.rank));

    // Group by taskId
    const taskMap = new Map<string, RankedConversation[]>();
    for (const conv of ranked) {
      const list = taskMap.get(conv.taskId);
      if (list) list.push(conv);
      else taskMap.set(conv.taskId, [conv]);
    }

    const waiting: TaskGroup[] = [];
    const working: TaskGroup[] = [];
    let waitingCount = 0;
    for (const [taskId, members] of taskMap) {
      if (members.length === 0) continue;
      const workingMember = members.find((m) => m.status === "working" || m.status === "starting");
      const mostRecent = members.reduce((a, b) => (b.createdAt > a.createdAt ? b : a));
      const selected = workingMember ?? mostRecent;
      const group: TaskGroup = { taskId, selected, members, count: members.length };
      if (workingMember) {
        working.push(group);
      } else {
        waiting.push(group);
        waitingCount += members.filter((m) => m.status === "waiting").length;
      }
    }
    waiting.sort((a, b) => Rank.compare(a.selected.rank, b.selected.rank));
    working.sort((a, b) => Rank.compare(a.selected.rank, b.selected.rank));

    return {
      waitingGroups: waiting,
      workingGroups: working,
      allWaitingCount: waitingCount,
      blockedIds: blocked,
      unranked: noRank,
    };
  }, [active, rankRows, tasksResult]);

  const disconnected = useMemo(
    () => active.filter((c) => c.status === "gone"),
    [active],
  );

  const [workingExpanded, setWorkingExpanded] = useState<boolean>(() => {
    try {
      return localStorage.getItem(WORKING_EXPANDED_KEY) !== "0";
    } catch {
      return true;
    }
  });
  const toggleWorkingExpanded = useCallback(() => {
    setWorkingExpanded((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(WORKING_EXPANDED_KEY, next ? "1" : "0");
      // eslint-disable-next-line promise-safety/no-bare-catch
      } catch {}
      return next;
    });
  }, []);

  const [queueExpanded, setQueueExpanded] = useState<boolean>(() => {
    try {
      return localStorage.getItem(QUEUE_EXPANDED_KEY) !== "0";
    } catch {
      return true;
    }
  });
  const toggleQueueExpanded = useCallback(() => {
    setQueueExpanded((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(QUEUE_EXPANDED_KEY, next ? "1" : "0");
      // eslint-disable-next-line promise-safety/no-bare-catch
      } catch {}
      return next;
    });
  }, []);

  const [unrankedExpanded, setUnrankedExpanded] = useState<boolean>(() => {
    try {
      return localStorage.getItem(UNRANKED_EXPANDED_KEY) !== "0";
    } catch {
      return true;
    }
  });
  const toggleUnrankedExpanded = useCallback(() => {
    setUnrankedExpanded((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(UNRANKED_EXPANDED_KEY, next ? "1" : "0");
      // eslint-disable-next-line promise-safety/no-bare-catch
      } catch {}
      return next;
    });
  }, []);

  const [disconnectedExpanded, setDisconnectedExpanded] = useState<boolean>(() => {
    try {
      return localStorage.getItem(DISCONNECTED_EXPANDED_KEY) !== "0";
    } catch {
      return true;
    }
  });
  const toggleDisconnectedExpanded = useCallback(() => {
    setDisconnectedExpanded((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(DISCONNECTED_EXPANDED_KEY, next ? "1" : "0");
      // eslint-disable-next-line promise-safety/no-bare-catch
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
      // eslint-disable-next-line promise-safety/no-bare-catch
      } catch {}
      return next;
    });
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  // Build a flat ranked list for drag overlay lookup
  const allRanked = useMemo(() => {
    const all: RankedConversation[] = [];
    for (const g of waitingGroups) all.push(...g.members);
    for (const g of workingGroups) all.push(...g.members);
    return all;
  }, [waitingGroups, workingGroups]);

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const draggingConv = useMemo(
    () => (draggingId ? allRanked.find((c) => c.id === draggingId) : null),
    [draggingId, allRanked],
  );

  const onDragStart = useCallback((event: DragStartEvent) => {
    setDraggingId(parseDragId(event.active.id));
  }, []);

  const onDragEnd = useCallback(async (event: DragEndEvent) => {
    setDraggingId(null);
    const conversationId = parseDragId(event.active.id);
    const drop = event.over?.data.current as DropData | undefined;
    if (!conversationId || !drop || drop.targetId === conversationId) return;
    await queuePost("reorder", { conversationId, targetId: drop.targetId, zone: drop.zone });
  }, []);

  const pinnedCluster = useMemo(
    () => {
      if (!pinnedConversationId) return null;
      return waitingGroups.find((g) => g.members.some((m) => m.id === pinnedConversationId)) ?? null;
    },
    [pinnedConversationId, waitingGroups],
  );
  const restClusters = useMemo(
    () => (pinnedCluster ? waitingGroups.filter((g) => g !== pinnedCluster) : waitingGroups),
    [waitingGroups, pinnedCluster],
  );

  if (!isLoading && waitingGroups.length === 0 && workingGroups.length === 0 && unranked.length === 0 && disconnected.length === 0 && recentGone.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-xs text-muted-foreground">
        All clear — no conversations are waiting on you.
      </div>
    );
  }

  const dragInProgress = draggingId !== null;

  // Compute cumulative sticky tops so headers stack when scrolled
  let nextTop = 0;

  const queueTop = nextTop;
  nextTop += SECTION_H;

  const hasTopItem = queueExpanded && pinnedCluster != null;
  const topItemTop = nextTop;
  if (hasTopItem) nextTop += SECTION_H + 8;

  const workingTop = nextTop;
  nextTop += SECTION_H;

  const unrankedTop = nextTop;
  if (unranked.length > 0) nextTop += SECTION_H;

  const disconnectedTop = nextTop;
  if (disconnected.length > 0) nextTop += SECTION_H;

  const goneTop = nextTop;

  return (
    <div className="flex flex-col">
      {/* Queue */}
      <SectionHeader title="Queue" count={allWaitingCount} expanded={queueExpanded} onToggleExpanded={toggleQueueExpanded} stickyTop={queueTop} />
      {queueExpanded && waitingGroups.length === 0 && (
        <div className="px-2 py-1 pl-2 text-[11px] italic text-muted-foreground">
          No conversations waiting
        </div>
      )}
      {queueExpanded && waitingGroups.length > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={pointerWithin}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragCancel={() => setDraggingId(null)}
        >
          {/* Pinned top item */}
          {pinnedCluster && (
            <div className="sticky z-10 bg-sidebar pt-px pb-1 pl-1" style={{ top: topItemTop }}>
              <SidebarMenu>
                <QueueRow
                  conv={pinnedCluster.selected}
                  clusterSize={pinnedCluster.count}
                  isTop
                  isBlocked={blockedIds.has(pinnedCluster.selected.id)}
                  isBottom={restClusters.length === 0}
                  canStepDown={restClusters.length > 0}
                  isActive={pinnedCluster.selected.id === activeId}
                  dragInProgress={dragInProgress}
                  onNavigate={onNavigate}
                  onClose={onCloseConversation}
                  onPromoteToTop={(id) => queuePost("promote", { conversationId: id })}
                  onSendToBottom={(id) => queuePost("demote", { conversationId: id })}
                  onStepDown={(id) => queuePost("step-down", { conversationId: id, steps: 5 })}
                />
              </SidebarMenu>
            </div>
          )}
          {restClusters.length > 0 && (
            <div className="pl-1">
              <SidebarMenu>
                {restClusters.map((group, idx) => (
                  <QueueRow
                    key={group.selected.id}
                    conv={group.selected}
                    clusterSize={group.count}
                    isTop={false}
                    isBlocked={blockedIds.has(group.selected.id)}
                    isBottom={idx === restClusters.length - 1}
                    canStepDown={idx < restClusters.length - 1}
                    isActive={group.selected.id === activeId}
                    dragInProgress={dragInProgress}
                    onNavigate={onNavigate}
                    onClose={onCloseConversation}
                    onPromoteToTop={(id) => queuePost("promote", { conversationId: id })}
                    onSendToBottom={(id) => queuePost("demote", { conversationId: id })}
                    onStepDown={(id) => queuePost("step-down", { conversationId: id, steps: 5 })}
                  />
                ))}
              </SidebarMenu>
            </div>
          )}
          <DragOverlay dropAnimation={null}>
            {draggingConv ? (
              <div className="flex items-center rounded border border-accent bg-background/90 px-2 py-1.5 text-sm shadow-md">
                <ConversationItem conv={draggingConv} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* Working */}
      <SectionHeader title="Working" count={workingGroups.length} expanded={workingExpanded} onToggleExpanded={toggleWorkingExpanded} stickyTop={workingTop} />
      {workingExpanded && (
        <div className="mt-0.5 pl-1">
          {workingGroups.length === 0 ? (
            <div className="px-2 py-1 text-[11px] italic text-muted-foreground">
              No agents working
            </div>
          ) : (
            <SidebarMenu>
              {workingGroups.map((group) => (
                <li key={group.selected.id} className="group/menu-item relative list-none">
                  <SidebarMenuButton
                    className="h-auto py-2"
                    isActive={group.selected.id === activeId}
                    onClick={() => onNavigate(group.selected.id)}
                  >
                    <ConversationItem conv={group.selected} />
                    {group.count > 1 && (
                      <span className="ml-auto shrink-0 rounded-full bg-red-500/20 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-red-500">
                        {group.count}
                      </span>
                    )}
                  </SidebarMenuButton>
                  <SidebarMenuAction
                    onClick={(e: React.MouseEvent) =>
                      void onCloseConversation(group.selected.id, e)
                    }
                    className="opacity-0 group-hover/menu-item:opacity-100"
                    aria-label="Close conversation"
                  >
                    <MdClose className="size-3.5" />
                  </SidebarMenuAction>
                </li>
              ))}
            </SidebarMenu>
          )}
        </div>
      )}

      {/* Unranked */}
      {unranked.length > 0 && (
        <>
          <SectionHeader title="Unranked" count={unranked.length} expanded={unrankedExpanded} onToggleExpanded={toggleUnrankedExpanded} stickyTop={unrankedTop} />
          {unrankedExpanded && (
            <div className="mt-0.5 pl-1">
              <SidebarMenu>
                {unranked.map((conv) => (
                  <li key={conv.id} className="group/menu-item relative list-none">
                    <SidebarMenuButton
                      className="h-auto py-2"
                      isActive={conv.id === activeId}
                      onClick={() => onNavigate(conv.id)}
                    >
                      <ConversationItem conv={conv} />
                    </SidebarMenuButton>
                    <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center opacity-0 group-hover/menu-item:opacity-100">
                      <button
                        onClick={(e) => { e.stopPropagation(); void queuePost("rerank", { conversationId: conv.id }); }}
                        className="flex h-5 w-5 items-center justify-center rounded hover:bg-accent"
                        aria-label="Add to queue"
                      >
                        <MdOutlineQueue className="size-3.5" />
                      </button>
                      <button
                        onClick={(e: React.MouseEvent) => { e.stopPropagation(); void onCloseConversation(conv.id, e); }}
                        className="flex h-5 w-5 items-center justify-center rounded hover:bg-accent"
                        aria-label="Close conversation"
                      >
                        <MdClose className="size-3.5" />
                      </button>
                    </div>
                  </li>
                ))}
              </SidebarMenu>
            </div>
          )}
        </>
      )}

      {/* Disconnected */}
      {disconnected.length > 0 && (
        <>
          <SectionHeader title="Disconnected" count={disconnected.length} expanded={disconnectedExpanded} onToggleExpanded={toggleDisconnectedExpanded} stickyTop={disconnectedTop} />
          {disconnectedExpanded && (
            <div className="mt-0.5 pl-1">
              <SidebarMenu>
                {disconnected.map((conv) => (
                  <li key={conv.id} className="group/menu-item relative list-none">
                    <SidebarMenuButton
                      className="h-auto py-2 opacity-60"
                      isActive={conv.id === activeId}
                      onClick={() => onNavigate(conv.id)}
                    >
                      <ConversationItem conv={conv} />
                    </SidebarMenuButton>
                    <SidebarMenuAction
                      onClick={(e: React.MouseEvent) =>
                        void onCloseConversation(conv.id, e)
                      }
                      className="opacity-0 group-hover/menu-item:opacity-100"
                      aria-label="Close conversation"
                    >
                      <MdClose className="size-3.5" />
                    </SidebarMenuAction>
                  </li>
                ))}
              </SidebarMenu>
            </div>
          )}
        </>
      )}

      {/* Done */}
      {recentGone.length > 0 && (
        <>
          <SectionHeader title="Done" count={recentGone.length} expanded={goneExpanded} onToggleExpanded={toggleGoneExpanded} stickyTop={goneTop} />
          {goneExpanded && (
            <div className="mt-0.5 pl-1">
              <SidebarMenu>
                {recentGone.map((conv) => (
                  <li key={conv.id} className="group/menu-item relative list-none">
                    <SidebarMenuButton
                      className="h-auto py-2 opacity-60"
                      isActive={conv.id === activeId}
                      onClick={() => onNavigate(conv.id)}
                    >
                      <ConversationItem conv={conv} />
                    </SidebarMenuButton>
                  </li>
                ))}
              </SidebarMenu>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function QueueRow({
  conv,
  clusterSize,
  isTop,
  isBlocked,
  isBottom,
  canStepDown,
  isActive,
  dragInProgress,
  onNavigate,
  onClose,
  onPromoteToTop,
  onSendToBottom,
  onStepDown,
}: {
  conv: Conversation;
  clusterSize: number;
  isTop: boolean;
  isBlocked: boolean;
  isBottom: boolean;
  canStepDown: boolean;
  isActive: boolean;
  dragInProgress: boolean;
  onNavigate: (id: string) => void;
  onClose: (id: string, e: React.MouseEvent) => void | Promise<void>;
  onPromoteToTop: (id: string) => Promise<void>;
  onSendToBottom: (id: string) => Promise<void>;
  onStepDown: (id: string) => Promise<void>;
}): ReactNode {
  const draggable = useDraggable({
    id: `queue-conv-${conv.id}`,
    data: { kind: "drag-conv", convId: conv.id } as const,
  });
  const beforeDrop = useDroppable({
    id: `queue-before-${conv.id}`,
    data: { zone: "before", targetId: conv.id } as DropData,
  });
  const afterDrop = useDroppable({
    id: `queue-after-${conv.id}`,
    data: { zone: "after", targetId: conv.id } as DropData,
  });

  return (
    <li className="group/menu-item relative list-none">
      <div
        ref={beforeDrop.setNodeRef}
        className={cn(
          "absolute -top-1 left-0 right-0 z-10 h-2",
          dragInProgress && beforeDrop.isOver && "bg-primary/40",
        )}
      />
      <div
        ref={draggable.setNodeRef}
        {...draggable.attributes}
        {...draggable.listeners}
        className={cn(
          "relative",
          draggable.isDragging && "opacity-40",
          isTop && "rounded-md ring-1 ring-border/80 shadow-[0_6px_16px_rgba(0,0,0,0.45),0_2px_4px_rgba(0,0,0,0.25)] -translate-y-px bg-sidebar",
        )}
      >
        <SidebarMenuButton
          className={cn(
            "h-auto py-2",
            isBlocked && "opacity-50",
          )}
          isActive={isActive}
          onClick={() => onNavigate(conv.id)}
        >
          <ConversationItem conv={conv} />
          {clusterSize > 1 && (
            <span className="ml-auto shrink-0 rounded-full bg-red-500/20 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-red-500">
              {clusterSize}
            </span>
          )}
        </SidebarMenuButton>
        <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center opacity-0 group-hover/menu-item:opacity-100">
          {!isTop && (
            <button
              onClick={(e) => { e.stopPropagation(); void onPromoteToTop(conv.id); }}
              className="flex h-5 w-5 items-center justify-center rounded hover:bg-accent"
              aria-label="Move to top"
            >
              <MdVerticalAlignTop className="size-3.5" />
            </button>
          )}
          {canStepDown && (
            <button
              onClick={(e) => { e.stopPropagation(); void onStepDown(conv.id); }}
              className="flex h-5 w-5 items-center justify-center rounded hover:bg-accent"
              aria-label="Move down 5"
            >
              <MdKeyboardDoubleArrowDown className="size-3.5" />
            </button>
          )}
          {!isBottom && (
            <button
              onClick={(e) => { e.stopPropagation(); void onSendToBottom(conv.id); }}
              className="flex h-5 w-5 items-center justify-center rounded hover:bg-accent"
              aria-label="Move to bottom"
            >
              <MdVerticalAlignBottom className="size-3.5" />
            </button>
          )}
          <button
            onClick={(e: React.MouseEvent) => void onClose(conv.id, e)}
            className="flex h-5 w-5 items-center justify-center rounded hover:bg-accent"
            aria-label="Close conversation"
          >
            <MdClose className="size-3.5" />
          </button>
        </div>
      </div>
      <div
        ref={afterDrop.setNodeRef}
        className={cn(
          "absolute -bottom-1 left-0 right-0 z-10 h-2",
          dragInProgress && afterDrop.isOver && "bg-primary/40",
        )}
      />
    </li>
  );
}
