import { createContext, useState, type ReactNode } from "react";
import { MdAdd, MdClose, MdSearch, MdStorefront } from "react-icons/md";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useEditMode } from "./edit-mode-store";

const DRAG_PREFIX = "reorder-drag-";
const DROP_PREFIX = "reorder-drop-";

export { DRAG_PREFIX, DROP_PREFIX };

export const DRAG_GROUP_PREFIX = "reorder-drag-group-";

export function stripPrefix(prefix: string, s: string): string {
  return s.startsWith(prefix) ? s.slice(prefix.length) : s;
}

// --- Area context ------------------------------------------------------------

type InsertionIndicator = {
  itemId: string;
  position: "before" | "after";
} | null;

type GroupingIndicator = {
  targetId: string;
} | null;

export type { InsertionIndicator, GroupingIndicator };

export type ReorderAreaCtxValue = {
  storageId: string;
  hiddenItems: Array<{ key: string; label: string }>;
  insertionIndicator: InsertionIndicator;
  groupingIndicator: GroupingIndicator;
  addSpacer: () => void;
  addGroup: () => void;
  dragInProgress: boolean;
};

export const ReorderAreaContext = createContext<ReorderAreaCtxValue | null>(
  null,
);

// --- Reorder item (three zone) -----------------------------------------------

export function ReorderItemThreeZone({
  itemKey,
  storageId,
  insertionIndicator,
  groupingIndicator,
  children,
}: {
  itemKey: string;
  storageId: string;
  insertionIndicator: InsertionIndicator;
  groupingIndicator: GroupingIndicator;
  children: ReactNode;
}) {
  const draggable = useDraggable({ id: `${DRAG_PREFIX}${itemKey}` });

  const beforeDroppable = useDroppable({
    id: `reorder-drop-before-${itemKey}`,
    data: { zone: "before", targetId: itemKey },
  });
  const afterDroppable = useDroppable({
    id: `reorder-drop-after-${itemKey}`,
    data: { zone: "after", targetId: itemKey },
  });
  const childDroppable = useDroppable({
    id: `reorder-drop-child-${itemKey}`,
    data: { zone: "child", targetId: itemKey },
  });

  const transform = draggable.transform;
  const isDragging = draggable.isDragging;

  const style: React.CSSProperties = isDragging
    ? {
        transform: transform
          ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
          : undefined,
        touchAction: "none",
        zIndex: 50,
      }
    : { touchAction: "none" };

  function handleHide(e: React.MouseEvent) {
    e.stopPropagation();
    void fetch(`/api/reorder/${storageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contributionId: itemKey, hidden: true }),
    });
  }

  const isGroupTarget = groupingIndicator?.targetId === itemKey;
  const showBefore =
    insertionIndicator?.itemId === itemKey &&
    insertionIndicator.position === "before";
  const showAfter =
    insertionIndicator?.itemId === itemKey &&
    insertionIndicator.position === "after";

  return (
    <>
      {showBefore && <div className="reorder-drop-indicator" />}
      <div
        ref={draggable.setNodeRef}
        {...draggable.attributes}
        {...draggable.listeners}
        style={style}
        className="group/reorder-item relative"
      >
        <div
          ref={childDroppable.setNodeRef}
          className={[
            "relative cursor-grab rounded-md ring-1 ring-primary/50",
            isDragging && "opacity-40",
            isGroupTarget && "ring-2 ring-primary bg-accent/30",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <button
            className="absolute -top-1.5 -right-1.5 z-10 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] leading-none cursor-pointer opacity-0 group-hover/reorder-item:opacity-80 hover:!opacity-100 transition-opacity"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={handleHide}
            aria-label="Hide item"
          >
            <MdClose className="size-2.5" />
          </button>
          <div className="pointer-events-none">{children}</div>
        </div>
        <div
          ref={beforeDroppable.setNodeRef}
          className="pointer-events-none absolute inset-x-0 top-0 h-[8px]"
        />
        <div
          ref={afterDroppable.setNodeRef}
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[8px]"
        />
      </div>
      {showAfter && <div className="reorder-drop-indicator" />}
    </>
  );
}

// --- Spacer reorder item -----------------------------------------------------

export function SpacerReorderItem({
  itemKey,
  storageId,
  insertionIndicator,
}: {
  itemKey: string;
  storageId: string;
  insertionIndicator: InsertionIndicator;
}) {
  const editMode = useEditMode();
  const draggable = useDraggable({ id: `${DRAG_PREFIX}${itemKey}` });
  const droppable = useDroppable({ id: `${DROP_PREFIX}${itemKey}` });

  if (!editMode) {
    return (
      <div ref={droppable.setNodeRef} className="flex-1" />
    );
  }

  const transform = draggable.transform;
  const isDragging = draggable.isDragging;
  const style: React.CSSProperties = isDragging
    ? {
        transform: transform
          ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
          : undefined,
        touchAction: "none",
        zIndex: 50,
      }
    : { touchAction: "none" };

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    void fetch(`/api/reorder/${storageId}/${itemKey}`, {
      method: "DELETE",
    });
  }

  const showBefore =
    insertionIndicator?.itemId === itemKey &&
    insertionIndicator.position === "before";
  const showAfter =
    insertionIndicator?.itemId === itemKey &&
    insertionIndicator.position === "after";

  return (
    <>
      {showBefore && <div className="reorder-drop-indicator" />}
      <div
        ref={(node) => {
          draggable.setNodeRef(node);
          droppable.setNodeRef(node);
        }}
        {...draggable.attributes}
        {...draggable.listeners}
        style={style}
        className={[
          "group relative flex h-7 min-w-8 flex-1 cursor-grab items-center justify-center rounded-md border border-dashed border-muted-foreground/40 px-2",
          isDragging && "opacity-40",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <span className="text-[10px] text-muted-foreground/60 select-none">
          ⇔
        </span>
        <button
          className="absolute -top-1.5 -right-1.5 z-10 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] leading-none cursor-pointer opacity-0 group-hover:opacity-80 hover:!opacity-100 transition-opacity"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={handleDelete}
          aria-label="Remove spacer"
        >
          <MdClose className="size-2.5" />
        </button>
      </div>
      {showAfter && <div className="reorder-drop-indicator" />}
    </>
  );
}

// --- Restore button ----------------------------------------------------------

export function RestoreButton({
  storageId,
  hiddenItems,
  addSpacer,
  addGroup,
}: {
  storageId: string;
  hiddenItems: Array<{ key: string; label: string }>;
  addSpacer: () => void;
  addGroup: () => void;
}) {
  const [open, setOpen] = useState(false);
  const hasHidden = hiddenItems.length > 0;

  function handleRestore(contributionId: string) {
    void fetch(`/api/reorder/${storageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contributionId, hidden: false }),
    });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="flex h-7 shrink-0 items-center justify-center gap-1.5 rounded-md border border-dashed border-muted-foreground/40 px-2.5 text-xs text-muted-foreground hover:border-muted-foreground/70 hover:text-foreground transition-colors"
        aria-label="Add items"
      >
        <MdAdd className="size-3.5" />
        {hasHidden
          ? hiddenItems.length === 1
            ? "1 hidden"
            : `${hiddenItems.length} hidden`
          : "Add"}
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start">
        {hasHidden && (
          <div className="p-1">
            {hiddenItems.map((item) => (
              <button
                key={item.key}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
                onClick={() => {
                  handleRestore(item.key);
                  if (hiddenItems.length <= 1) setOpen(false);
                }}
              >
                <MdAdd className="size-3.5 shrink-0 text-muted-foreground" />
                {item.label}
              </button>
            ))}
          </div>
        )}

        <div className="border-t border-border p-1">
          <button
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
            onClick={() => {
              addGroup();
              setOpen(false);
            }}
          >
            <MdAdd className="size-3.5 shrink-0 text-muted-foreground" />
            Add Group
          </button>
          <button
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
            onClick={() => {
              addSpacer();
              setOpen(false);
            }}
          >
            <MdAdd className="size-3.5 shrink-0 text-muted-foreground" />
            Add Spacer
          </button>
        </div>

        <div className="border-t border-border px-2.5 py-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1.5">
            <MdStorefront className="size-3.5" />
            Marketplace
          </div>
          <div className="relative">
            <MdSearch className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search..."
              className="h-7 pl-7 text-xs"
              disabled
            />
          </div>
          <p className="mt-1.5 text-center text-xs text-muted-foreground/60">
            No items
          </p>
        </div>

        <div className="border-t border-border p-1">
          <button
            disabled
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-muted-foreground/50 cursor-not-allowed"
          >
            <MdAdd className="size-3.5 shrink-0" />
            Create custom plugin
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
