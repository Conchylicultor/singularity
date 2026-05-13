import { createContext, useContext, useState, type ReactNode } from "react";
import { MdAdd, MdClose, MdSearch, MdStorefront } from "react-icons/md";
import { useDroppable } from "@dnd-kit/core";
import { Input } from "@/components/ui/input";
import { InlinePopover } from "@plugins/primitives/plugins/popover/web";
import { SortableItem } from "@plugins/primitives/plugins/sortable-list/web";
import { cn } from "@/lib/utils";
import { useEditMode } from "./edit-mode-store";

// --- Area context ------------------------------------------------------------

export type ReorderAreaCtxValue = {
  storageId: string;
  hiddenItems: Array<{ key: string; label: string }>;
  addSpacer: () => void;
  addGroup: () => void;
  dragInProgress: boolean;
  orientation: "horizontal" | "vertical";
};

export const ReorderAreaContext = createContext<ReorderAreaCtxValue | null>(
  null,
);

// --- Grouping zone (center overlay for group-on-drop) ------------------------

export function GroupingZone({ itemKey }: { itemKey: string }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `group-zone:${itemKey}`,
    data: { zone: "child", targetId: itemKey },
  });
  const ctx = useContext(ReorderAreaContext);
  const isHorizontal = ctx?.orientation === "horizontal";
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "absolute z-10 rounded transition-colors",
        isHorizontal
          ? "inset-y-0 left-[42.5%] right-[42.5%]"
          : "inset-x-0 top-[42.5%] bottom-[42.5%]",
        isOver && "ring-2 ring-primary bg-accent/30",
      )}
    />
  );
}

// --- Sortable reorder item ---------------------------------------------------

export function SortableReorderItem({
  itemKey,
  storageId,
  children,
}: {
  itemKey: string;
  storageId: string;
  children: ReactNode;
}) {
  function handleHide(e: React.MouseEvent) {
    e.stopPropagation();
    void fetch(`/api/reorder/${storageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contributionId: itemKey, hidden: true }),
    });
  }

  return (
    <SortableItem id={itemKey} className="group/reorder-item relative">
      {({ isDragging }) => (
        <>
          <div
            className={cn(
              "relative cursor-grab rounded-md ring-1 ring-primary/50",
              isDragging && "opacity-40",
            )}
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
          <GroupingZone itemKey={itemKey} />
        </>
      )}
    </SortableItem>
  );
}

// --- Spacer reorder item -----------------------------------------------------

export function SpacerReorderItem({
  itemKey,
  storageId,
}: {
  itemKey: string;
  storageId: string;
}) {
  const editMode = useEditMode();

  if (!editMode) {
    return <div className="flex-1" />;
  }

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    void fetch(`/api/reorder/${storageId}/${itemKey}`, {
      method: "DELETE",
    });
  }

  return (
    <SortableItem id={itemKey}>
      {({ isDragging }) => (
        <div
          className={cn(
            "group relative flex h-7 min-w-8 flex-1 cursor-grab items-center justify-center rounded-md border border-dashed border-muted-foreground/40 px-2",
            isDragging && "opacity-40",
          )}
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
      )}
    </SortableItem>
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
    <InlinePopover
      open={open}
      onOpenChange={setOpen}
      trigger={
        <button
          className="flex h-7 shrink-0 items-center justify-center gap-1.5 rounded-md border border-dashed border-muted-foreground/40 px-2.5 text-xs text-muted-foreground hover:border-muted-foreground/70 hover:text-foreground transition-colors"
          aria-label="Add items"
        >
          <MdAdd className="size-3.5" />
          {hasHidden
            ? hiddenItems.length === 1
              ? "1 hidden"
              : `${hiddenItems.length} hidden`
            : "Add"}
        </button>
      }
      contentClassName="w-56 p-0"
    >
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
      </InlinePopover>
  );
}
