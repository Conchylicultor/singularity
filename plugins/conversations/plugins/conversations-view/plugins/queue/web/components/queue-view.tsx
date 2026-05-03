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
import { MdChevronRight, MdClose, MdKeyboardDoubleArrowDown, MdVerticalAlignBottom, MdVerticalAlignTop } from "react-icons/md";
import { useConversations } from "@plugins/conversations/web";
import type { ViewProps } from "@plugins/conversations/plugins/conversations-view/web";
import { ConversationItem } from "@plugins/conversations/plugins/conversation-ui/plugins/item/web";
import type { Conversation } from "@plugins/tasks-core/shared";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { queueRanksResource } from "../../shared/resources";
import {
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

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
const GONE_EXPANDED_KEY = "queue-view:gone:expanded";

function SectionBox({
  title,
  count,
  expanded,
  onToggleExpanded,
  children,
}: {
  title: string;
  count: number;
  expanded: boolean;
  onToggleExpanded: () => void;
  children: ReactNode;
}) {
  return (
    <div className="group/box rounded-md transition-colors hover:bg-muted/30">
      <div className="group/header flex items-center gap-0.5 rounded-md px-1 py-1">
        <button
          type="button"
          onClick={onToggleExpanded}
          aria-label={expanded ? `Collapse ${title}` : `Expand ${title}`}
          className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent"
        >
          <MdChevronRight
            className={cn("size-4 transition-transform", expanded && "rotate-90")}
          />
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
      {expanded && <div className="mt-0.5 pl-1">{children}</div>}
    </div>
  );
}

export function QueueView({
  activeId,
  onNavigate,
  onCloseConversation,
}: ViewProps) {
  const { active, recentGone, isLoading } = useConversations();
  const { data: rankRows } = useResource(queueRanksResource);

  const working = useMemo(
    () =>
      active.filter((c) => c.status === "working" || c.status === "starting"),
    [active],
  );

  // Anki-style deck: a single global ordered list of waiting conversations,
  // sorted by rank ascending. Top of the list is "what to do next". Rank is
  // owned by the queue plugin's side-table (queueRanksResource) — a
  // conversation only appears in the deck once the seed-rank job has fired.
  // Uses code-point order (not localeCompare) to match Postgres COLLATE "C".
  // Waiting conversations with no rank entry yet go into `unranked`.
  const { deck, unranked } = useMemo(() => {
    const ranks = new Map((rankRows ?? []).map((r) => [r.conversationId, r.rank]));
    const ranked: Array<Conversation & { rank: string }> = [];
    const noRank: Conversation[] = [];
    for (const c of active) {
      if (c.status !== "waiting") continue;
      const rank = ranks.get(c.id);
      if (rank) {
        ranked.push({ ...c, rank });
      } else {
        noRank.push(c);
      }
    }
    return {
      deck: ranked.sort((a, b) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0)),
      unranked: noRank,
    };
  }, [active, rankRows]);

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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const draggingConv = useMemo(
    () => (draggingId ? deck.find((c) => c.id === draggingId) : null),
    [draggingId, deck],
  );

  const onDragStart = useCallback((event: DragStartEvent) => {
    setDraggingId(parseDragId(event.active.id));
  }, []);

  // Server computes the new rank from targetId + zone — no stale deck reads here.
  const onDragEnd = useCallback(async (event: DragEndEvent) => {
    setDraggingId(null);
    const conversationId = parseDragId(event.active.id);
    const drop = event.over?.data.current as DropData | undefined;
    if (!conversationId || !drop || drop.targetId === conversationId) return;
    await queuePost("reorder", { conversationId, targetId: drop.targetId, zone: drop.zone });
  }, []);

  if (!isLoading && deck.length === 0 && working.length === 0 && unranked.length === 0 && recentGone.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-xs text-muted-foreground">
        All clear — no conversations are waiting on you.
      </div>
    );
  }

  const dragInProgress = draggingId !== null;

  return (
    <div className="flex flex-col gap-1.5">
      <SectionBox
        title="Queue"
        count={deck.length}
        expanded={queueExpanded}
        onToggleExpanded={toggleQueueExpanded}
      >
        {deck.length === 0 ? (
          <div className="px-2 py-1 text-[11px] italic text-muted-foreground">
            No conversations waiting
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={pointerWithin}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onDragCancel={() => setDraggingId(null)}
          >
            <SidebarMenu>
              {deck.map((conv, idx) => (
                <QueueRow
                  key={conv.id}
                  conv={conv}
                  isTop={idx === 0}
                  isBottom={idx === deck.length - 1}
                  canStepDown={idx < deck.length - 1}
                  isActive={conv.id === activeId}
                  dragInProgress={dragInProgress}
                  onNavigate={onNavigate}
                  onClose={onCloseConversation}
                  onPromoteToTop={(id) => queuePost("promote", { conversationId: id })}
                  onSendToBottom={(id) => queuePost("demote", { conversationId: id })}
                  onStepDown={(id) => queuePost("step-down", { conversationId: id, steps: 5 })}
                />
              ))}
            </SidebarMenu>
            <DragOverlay dropAnimation={null}>
              {draggingConv ? (
                <div className="flex items-center rounded border border-accent bg-background/90 px-2 py-1.5 text-sm shadow-md">
                  <ConversationItem conv={draggingConv} />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </SectionBox>
      <SectionBox
        title="Working"
        count={working.length}
        expanded={workingExpanded}
        onToggleExpanded={toggleWorkingExpanded}
      >
        {working.length === 0 ? (
          <div className="px-2 py-1 text-[11px] italic text-muted-foreground">
            No agents working
          </div>
        ) : (
          <SidebarMenu>
            {working.map((conv) => (
              <li key={conv.id} className="group/menu-item relative list-none">
                <SidebarMenuButton
                  className="h-auto py-1.5"
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
        )}
      </SectionBox>
      {unranked.length > 0 && (
        <SectionBox
          title="Unranked"
          count={unranked.length}
          expanded={unrankedExpanded}
          onToggleExpanded={toggleUnrankedExpanded}
        >
          <SidebarMenu>
            {unranked.map((conv) => (
              <li key={conv.id} className="group/menu-item relative list-none">
                <SidebarMenuButton
                  className="h-auto py-1.5"
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
        </SectionBox>
      )}
      {recentGone.length > 0 && (
        <SectionBox
          title="Recently gone"
          count={recentGone.length}
          expanded={goneExpanded}
          onToggleExpanded={toggleGoneExpanded}
        >
          <SidebarMenu>
            {recentGone.map((conv) => (
              <li key={conv.id} className="group/menu-item relative list-none">
                <SidebarMenuButton
                  className="h-auto py-1.5 opacity-60"
                  isActive={conv.id === activeId}
                  onClick={() => onNavigate(conv.id)}
                >
                  <ConversationItem conv={conv} />
                </SidebarMenuButton>
              </li>
            ))}
          </SidebarMenu>
        </SectionBox>
      )}
    </div>
  );
}

function QueueRow({
  conv,
  isTop,
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
  isTop: boolean;
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
        className={cn("relative", draggable.isDragging && "opacity-40")}
      >
        <SidebarMenuButton
          className={cn(
            "h-auto py-1.5",
            isTop && "border-l-2 border-primary/60",
          )}
          isActive={isActive}
          onClick={() => onNavigate(conv.id)}
        >
          <ConversationItem conv={conv} />
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
