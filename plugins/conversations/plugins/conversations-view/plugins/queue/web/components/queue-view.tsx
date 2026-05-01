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
import { generateKeyBetween } from "fractional-indexing";
import { MdChevronRight, MdClose } from "react-icons/md";
import { useConversations } from "@plugins/conversations/web";
import type { ViewProps } from "@plugins/conversations/plugins/conversations-view/web";
import { ConversationItem } from "@plugins/conversations/plugins/conversation-ui/plugins/item/web";
import type { Conversation } from "@plugins/tasks-core/shared";
import {
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

type DropData = {
  zone: "before" | "after";
  targetId: string;
};

function parseDragId(id: string | number): string | null {
  if (typeof id !== "string" || !id.startsWith("queue-conv-")) return null;
  return id.slice("queue-conv-".length);
}

const WORKING_EXPANDED_KEY = "queue-view:working:expanded";
const QUEUE_EXPANDED_KEY = "queue-view:queue:expanded";

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
  const { active, isLoading } = useConversations();

  const working = useMemo(
    () =>
      active.filter((c) => c.status === "working" || c.status === "starting"),
    [active],
  );

  const deck = useMemo(() => {
    const waiting = active.filter(
      (c): c is Conversation & { rank: string } =>
        c.status === "waiting" && c.rank !== null,
    );
    return [...waiting].sort((a, b) => a.rank.localeCompare(b.rank));
  }, [active]);

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

  const onDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setDraggingId(null);
      const draggedId = parseDragId(event.active.id);
      const drop = event.over?.data.current as DropData | undefined;
      if (!draggedId || !drop) return;
      if (drop.targetId === draggedId) return;

      const targetIdx = deck.findIndex((c) => c.id === drop.targetId);
      if (targetIdx < 0) return;
      const target = deck[targetIdx]!;

      let newRank: string;
      try {
        if (drop.zone === "before") {
          let prev: (typeof deck)[number] | undefined;
          for (let i = targetIdx - 1; i >= 0; i--) {
            if (deck[i]!.id !== draggedId) {
              prev = deck[i];
              break;
            }
          }
          newRank = generateKeyBetween(prev?.rank ?? null, target.rank);
        } else {
          let next: (typeof deck)[number] | undefined;
          for (let i = targetIdx + 1; i < deck.length; i++) {
            if (deck[i]!.id !== draggedId) {
              next = deck[i];
              break;
            }
          }
          newRank = generateKeyBetween(target.rank, next?.rank ?? null);
        }
      } catch {
        return;
      }

      const dragged = deck.find((c) => c.id === draggedId);
      if (!dragged || newRank === dragged.rank) return;

      await fetch(`/api/conversations-queue/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: draggedId, rank: newRank }),
      });
    },
    [deck],
  );

  if (!isLoading && deck.length === 0 && working.length === 0) {
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
                  isActive={conv.id === activeId}
                  dragInProgress={dragInProgress}
                  onNavigate={onNavigate}
                  onClose={onCloseConversation}
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
    </div>
  );
}

function QueueRow({
  conv,
  isTop,
  isActive,
  dragInProgress,
  onNavigate,
  onClose,
}: {
  conv: Conversation;
  isTop: boolean;
  isActive: boolean;
  dragInProgress: boolean;
  onNavigate: (id: string) => void;
  onClose: (id: string, e: React.MouseEvent) => void | Promise<void>;
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
        <SidebarMenuAction
          onClick={(e: React.MouseEvent) => void onClose(conv.id, e)}
          className="opacity-0 group-hover/menu-item:opacity-100"
          aria-label="Close conversation"
        >
          <MdClose className="size-3.5" />
        </SidebarMenuAction>
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
