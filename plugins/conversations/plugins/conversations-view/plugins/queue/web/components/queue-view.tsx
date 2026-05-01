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
import { MdClose } from "react-icons/md";
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

export function QueueView({
  activeId,
  onNavigate,
  onCloseConversation,
}: ViewProps) {
  const { active, isLoading } = useConversations();

  // Anki-style deck: a single global ordered list of waiting conversations,
  // sorted by rank ascending. Top of the list is "what to do next". The rank
  // column is guaranteed populated server-side (assigned on insert + on every
  // transition into waiting); the null-guard here is a defensive belt.
  const deck = useMemo(() => {
    const waiting = active.filter(
      (c): c is Conversation & { rank: string } =>
        c.status === "waiting" && c.rank !== null,
    );
    return [...waiting].sort((a, b) => a.rank.localeCompare(b.rank));
  }, [active]);

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

  if (!isLoading && deck.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-xs text-muted-foreground">
        All clear — no conversations are waiting on you.
      </div>
    );
  }

  const dragInProgress = draggingId !== null;

  return (
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
