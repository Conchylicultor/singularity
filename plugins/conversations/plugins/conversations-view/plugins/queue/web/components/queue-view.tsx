import { cn, SidebarMenu, SidebarMenuAction, SidebarMenuButton } from "@plugins/primitives/plugins/ui-kit/web";
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
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Text } from "@plugins/primitives/plugins/text/web";
import { conversationsResource } from "@plugins/conversations/core";
import type { ViewProps } from "@plugins/conversations/plugins/conversations-view/web";
import { ConversationItem } from "@plugins/conversations/plugins/conversation-ui/plugins/item/web";
import type { Conversation } from "@plugins/tasks/plugins/tasks-core/core";
import { useResource, useCombinedResources } from "@plugins/primitives/plugins/live-state/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { useOptimisticResource } from "@plugins/primitives/plugins/optimistic-mutation/web";
import { fetchEndpoint, useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import { reorderQueue, promoteQueue, demoteQueue, stepDownQueue, rerankQueue } from "../../shared/endpoints";
import { queueRanksResource } from "../../shared/resources";
import { applyReorder, type ReorderVars } from "./apply-reorder";
import { tasksResource } from "@plugins/tasks/core";
import { Rank } from "@plugins/primitives/plugins/rank/core";

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
      className="group/header sticky z-nav flex items-center gap-2xs rounded-md bg-sidebar px-xs py-xs"
      style={{ top: stickyTop }}
    >
      <button
        type="button"
        onClick={onToggleExpanded}
        aria-expanded={expanded}
        aria-label={expanded ? `Collapse ${title}` : `Expand ${title}`}
        className="flex size-5 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
      >
        <CollapsibleChevron open={expanded} className="size-4" />
      </button>
      <Text as="div" variant="caption" className="min-w-0 flex-1 truncate px-xs py-2xs font-semibold text-muted-foreground">
        {title}
      </Text>
      {count > 0 && (
        <Badge size="sm" className="shrink-0 opacity-0 transition-opacity group-hover/header:opacity-100">
          {count}
        </Badge>
      )}
    </div>
  );
}

export function QueueView({
  activeId,
  onNavigate,
  onCloseConversation,
}: ViewProps) {
  const convResult = useResource(conversationsResource);
  const queueResult = useOptimisticResource<
    typeof queueRanksResource.initialData,
    ReorderVars
  >({
    resource: queueRanksResource,
    apply: applyReorder,
    mutate: (vars) => fetchEndpoint(reorderQueue, {}, { body: vars }),
  });
  const dispatchReorder = queueResult.dispatch;
  const { mutate: rerankMutation } = useEndpointMutation(rerankQueue);
  const tasksResult = useResource(tasksResource);
  // The section assignment reads THREE independently-arriving resources
  // (conversations, queue ranks, tasks). Gate on all of them together: a
  // half-loaded snapshot (conversations present, ranks still empty) would
  // bucket every waiting conversation as "Unranked".
  const all = useCombinedResources({
    conv: convResult,
    queue: queueResult,
    tasks: tasksResult,
  });

  // Unified task-group logic across all statuses — computed only from a
  // mutually-consistent settled snapshot (empty until `all` settles; the
  // component early-returns a skeleton before rendering in that state).
  const {
    waitingGroups,
    workingGroups,
    allWaitingCount,
    blockedIds,
    unranked,
    disconnected,
    recentGone,
    pinnedConversationId,
  } = useMemo(() => {
    if (all.pending) {
      return {
        waitingGroups: [] as TaskGroup[],
        workingGroups: [] as TaskGroup[],
        allWaitingCount: 0,
        blockedIds: new Set<string>(),
        unranked: [] as Conversation[],
        disconnected: [] as Conversation[],
        recentGone: [] as Conversation[],
        pinnedConversationId: null as string | null,
      };
    }
    const { conv, queue, tasks } = all.data;
    const active = conv.active;
    const ranks = new Map(queue.ranks.map((r) => [r.conversationId, r.rank]));
    const taskStatusMap = new Map(tasks.map((t) => [t.id, t.status]));
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
      disconnected: active.filter((c) => c.status === "gone"),
      recentGone: conv.recentGone,
      pinnedConversationId: queue.pinnedConversationId,
    };
  }, [all]);

  const [workingExpanded, setWorkingExpanded] = useState<boolean>(() => {
    try {
      return localStorage.getItem(WORKING_EXPANDED_KEY) !== "0";
    } catch (err) {
      if (!(err instanceof DOMException)) throw err;
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
    } catch (err) {
      if (!(err instanceof DOMException)) throw err;
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
    } catch (err) {
      if (!(err instanceof DOMException)) throw err;
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
    } catch (err) {
      if (!(err instanceof DOMException)) throw err;
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
    } catch (err) {
      if (!(err instanceof DOMException)) throw err;
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

  const onDragEnd = useCallback((event: DragEndEvent) => {
    setDraggingId(null);
    const conversationId = parseDragId(event.active.id);
    const drop = event.over?.data.current as DropData | undefined;
    if (!conversationId || !drop || drop.targetId === conversationId) return;
    // Optimistic: the dragged row re-ranks immediately; the WS push reconciles.
    dispatchReorder({ conversationId, targetId: drop.targetId, zone: drop.zone });
  }, [dispatchReorder]);

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

  // All three resources gate together; the delayed skeleton means a warm
  // (<100ms) load paints the real sections directly with no flash.
  if (all.pending) {
    return <Loading variant="rows" count={5} className="px-xs" />;
  }

  if (waitingGroups.length === 0 && workingGroups.length === 0 && unranked.length === 0 && disconnected.length === 0 && recentGone.length === 0) {
    return (
      <Text as="div" variant="caption" className="px-lg py-2xl text-center text-muted-foreground">
        All clear — no conversations are waiting on you.
      </Text>
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
    <div className="flex flex-col isolate">
      {/* Queue */}
      <SectionHeader title="Queue" count={allWaitingCount} expanded={queueExpanded} onToggleExpanded={toggleQueueExpanded} stickyTop={queueTop} />
      {queueExpanded && waitingGroups.length === 0 && (
        <div className="px-sm py-xs pl-sm text-2xs italic text-muted-foreground">
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
            <div className="sticky z-raised bg-sidebar pt-px pb-xs pl-xs" style={{ top: topItemTop }}>
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
                  onPromoteToTop={(id) => fetchEndpoint(promoteQueue, {}, { body: { conversationId: id } })}
                  onSendToBottom={(id) => fetchEndpoint(demoteQueue, {}, { body: { conversationId: id } })}
                  onStepDown={(id) => fetchEndpoint(stepDownQueue, {}, { body: { conversationId: id, steps: 5 } })}
                />
              </SidebarMenu>
            </div>
          )}
          {restClusters.length > 0 && (
            <div className="pl-xs">
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
                    onPromoteToTop={(id) => fetchEndpoint(promoteQueue, {}, { body: { conversationId: id } })}
                    onSendToBottom={(id) => fetchEndpoint(demoteQueue, {}, { body: { conversationId: id } })}
                    onStepDown={(id) => fetchEndpoint(stepDownQueue, {}, { body: { conversationId: id, steps: 5 } })}
                  />
                ))}
              </SidebarMenu>
            </div>
          )}
          <DragOverlay dropAnimation={null}>
            {draggingConv ? (
              <Text as="div" variant="body" className="flex items-center rounded-md border border-accent bg-background/90 px-sm py-xs shadow-md">
                <ConversationItem conv={draggingConv} />
              </Text>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* Working */}
      <SectionHeader title="Working" count={workingGroups.length} expanded={workingExpanded} onToggleExpanded={toggleWorkingExpanded} stickyTop={workingTop} />
      {workingExpanded && (
        // eslint-disable-next-line spacing/no-adhoc-spacing -- mt-0.5 nudges the section body just below its sticky header (sibling under a non-flex column)
        <div className="mt-0.5 pl-xs">
          {workingGroups.length === 0 ? (
            <div className="px-sm py-xs text-2xs italic text-muted-foreground">
              No agents working
            </div>
          ) : (
            <SidebarMenu>
              {workingGroups.map((group) => (
                <li key={group.selected.id} className="group/menu-item relative list-none">
                  <SidebarMenuButton
                    className="h-auto py-sm"
                    isActive={group.selected.id === activeId}
                    onClick={() => onNavigate(group.selected.id)}
                  >
                    <ConversationItem conv={group.selected} />
                    {group.count > 1 && (
                      <Badge variant="destructive" size="sm" className="ml-auto shrink-0">
                        {group.count}
                      </Badge>
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
            // eslint-disable-next-line spacing/no-adhoc-spacing -- mt-0.5 nudges the section body just below its sticky header (sibling under a non-flex column)
        <div className="mt-0.5 pl-xs">
              <SidebarMenu>
                {unranked.map((conv) => (
                  <li key={conv.id} className="group/menu-item relative list-none">
                    <SidebarMenuButton
                      className="h-auto py-sm"
                      isActive={conv.id === activeId}
                      onClick={() => onNavigate(conv.id)}
                    >
                      <ConversationItem conv={conv} />
                    </SidebarMenuButton>
                    <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center opacity-0 group-hover/menu-item:opacity-100">
                      <button
                        onClick={(e) => { e.stopPropagation(); rerankMutation({ body: { conversationId: conv.id } }); }}
                        className="flex h-5 w-5 items-center justify-center rounded-md hover:bg-accent"
                        aria-label="Add to queue"
                      >
                        <MdOutlineQueue className="size-3.5" />
                      </button>
                      <button
                        onClick={(e: React.MouseEvent) => { e.stopPropagation(); void onCloseConversation(conv.id, e); }}
                        className="flex h-5 w-5 items-center justify-center rounded-md hover:bg-accent"
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
            // eslint-disable-next-line spacing/no-adhoc-spacing -- mt-0.5 nudges the section body just below its sticky header (sibling under a non-flex column)
        <div className="mt-0.5 pl-xs">
              <SidebarMenu>
                {disconnected.map((conv) => (
                  <li key={conv.id} className="group/menu-item relative list-none">
                    <SidebarMenuButton
                      className="h-auto py-sm opacity-60"
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
            // eslint-disable-next-line spacing/no-adhoc-spacing -- mt-0.5 nudges the section body just below its sticky header (sibling under a non-flex column)
        <div className="mt-0.5 pl-xs">
              <SidebarMenu>
                {recentGone.map((conv) => (
                  <li key={conv.id} className="group/menu-item relative list-none">
                    <SidebarMenuButton
                      className="h-auto py-sm opacity-60"
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
          "absolute -top-1 left-0 right-0 z-raised h-2",
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
          isTop && "rounded-md ring-1 ring-border shadow-md bg-sidebar",
        )}
      >
        <SidebarMenuButton
          className={cn(
            "h-auto py-sm",
            isBlocked && "opacity-50",
          )}
          isActive={isActive}
          onClick={() => onNavigate(conv.id)}
        >
          <ConversationItem conv={conv} />
          {clusterSize > 1 && (
            <Badge variant="destructive" size="sm" className="ml-auto shrink-0">
              {clusterSize}
            </Badge>
          )}
        </SidebarMenuButton>
        <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center opacity-0 group-hover/menu-item:opacity-100">
          {!isTop && (
            <button
              onClick={(e) => { e.stopPropagation(); void onPromoteToTop(conv.id); }}
              className="flex h-5 w-5 items-center justify-center rounded-md hover:bg-accent"
              aria-label="Move to top"
            >
              <MdVerticalAlignTop className="size-3.5" />
            </button>
          )}
          {canStepDown && (
            <button
              onClick={(e) => { e.stopPropagation(); void onStepDown(conv.id); }}
              className="flex h-5 w-5 items-center justify-center rounded-md hover:bg-accent"
              aria-label="Move down 5"
            >
              <MdKeyboardDoubleArrowDown className="size-3.5" />
            </button>
          )}
          {!isBottom && (
            <button
              onClick={(e) => { e.stopPropagation(); void onSendToBottom(conv.id); }}
              className="flex h-5 w-5 items-center justify-center rounded-md hover:bg-accent"
              aria-label="Move to bottom"
            >
              <MdVerticalAlignBottom className="size-3.5" />
            </button>
          )}
          <button
            onClick={(e: React.MouseEvent) => void onClose(conv.id, e)}
            className="flex h-5 w-5 items-center justify-center rounded-md hover:bg-accent"
            aria-label="Close conversation"
          >
            <MdClose className="size-3.5" />
          </button>
        </div>
      </div>
      <div
        ref={afterDrop.setNodeRef}
        className={cn(
          "absolute -bottom-1 left-0 right-0 z-raised h-2",
          dragInProgress && afterDrop.isOver && "bg-primary/40",
        )}
      />
    </li>
  );
}
