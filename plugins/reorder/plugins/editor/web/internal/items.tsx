import { createContext, useContext, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { MdAdd, MdClose, MdSearch, MdStorefront } from "react-icons/md";
import { useDroppable } from "@dnd-kit/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InlinePopover } from "@plugins/primitives/plugins/popover/web";
import { Row } from "@plugins/primitives/plugins/row/web";
import { Text } from "@plugins/primitives/plugins/text/web";
import { SortableItem } from "@plugins/primitives/plugins/sortable-list/web";
import { cn } from "@/lib/utils";

// --- Area context ------------------------------------------------------------

// Read by the item-internal affordances (hide button, spacer delete button,
// grouping zone). The editor provides it; both the reorder middleware and the
// config field renderer flow through the same context.
export type ReorderAreaCtxValue = {
  orientation: "horizontal" | "vertical";
  /** Hide a contribution by id (its entryKey). */
  onHide: (id: string) => void;
  /** Remove a spacer node by id. */
  onDeleteSpacer: (id: string) => void;
  /** Whether grouping affordances (center drop zone) are active. */
  groupsEnabled: boolean;
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
        "absolute z-raised rounded-md transition-colors",
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
  editMode,
  label,
  wrapperClassName,
  children,
}: {
  itemKey: string;
  editMode: boolean;
  label: string;
  wrapperClassName?: string;
  children: ReactNode;
}) {
  const ctx = useContext(ReorderAreaContext);
  const isHorizontal = ctx?.orientation === "horizontal";
  const groupsEnabled = ctx?.groupsEnabled ?? false;
  const contentRef = useRef<HTMLDivElement>(null);
  const [isEmpty, setIsEmpty] = useState(false);

  useLayoutEffect(() => {
    if (!editMode) {
      setIsEmpty(false);
      return;
    }
    const el = contentRef.current;
    if (!el) return;

    const check = () => setIsEmpty(el.childNodes.length === 0);
    check();

    const observer = new MutationObserver(check);
    observer.observe(el, { childList: true });
    return () => observer.disconnect();
  }, [editMode]);

  function handleHide(e: React.MouseEvent) {
    e.stopPropagation();
    ctx?.onHide(itemKey);
  }

  return (
    <SortableItem
      id={itemKey}
      disabled={!editMode}
      className={
        editMode
          ? ({ isDragging }) =>
              cn(
                // `control-min-sm` + centered content gives every edit-mode box
                // a uniform height floor (matching the spacer and Add button)
                // so heterogeneous contributions don't render ragged rings.
                // Horizontal boxes hug their content; vertical boxes span the
                // column (`w-full`) like the un-wrapped list rows they replace.
                "group/reorder-item relative flex control-min-sm items-center cursor-grab rounded-md ring-1 ring-primary/50",
                isHorizontal ? "" : "w-full",
                wrapperClassName,
                isDragging && "opacity-40",
              )
          : "contents"
      }
    >
      {() => (
        <>
          {editMode && (
            <button
              className="absolute -top-1.5 -right-1.5 z-raised flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-destructive-foreground text-3xs cursor-pointer opacity-0 group-hover/reorder-item:opacity-80 hover:!opacity-100 transition-opacity"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={handleHide}
              aria-label="Hide item"
            >
              <MdClose className="size-2.5" />
            </button>
          )}
          <div
            ref={contentRef}
            className={cn(
              editMode ? "pointer-events-none" : "contents",
              // Fill the box so full-width vertical rows keep spanning the column.
              // Skip when empty — an empty `w-full` div would steal the whole row
              // from the placeholder sibling, wrapping its label onto two lines.
              editMode && !isHorizontal && !isEmpty && "w-full",
            )}
          >
            {children}
          </div>
          {editMode && isEmpty && (
            <div
              className={cn(
                "pointer-events-none select-none italic text-muted-foreground/50",
                isHorizontal
                  ? "px-2 py-0.5 text-3xs max-w-24 truncate"
                  : "w-full px-3 py-1.5 text-center text-caption",
              )}
            >
              {label}
            </div>
          )}
          {editMode && groupsEnabled && <GroupingZone itemKey={itemKey} />}
        </>
      )}
    </SortableItem>
  );
}

// --- Spacer reorder item -----------------------------------------------------

// A spacer renders as a flex gap. In edit mode it becomes a draggable, dashed
// placeholder with a delete button; the node is removed from the `items` tree
// via `onDeleteSpacer`.
export function SpacerReorderItem({
  itemKey,
  editMode,
}: {
  itemKey: string;
  editMode: boolean;
}) {
  const ctx = useContext(ReorderAreaContext);

  if (!editMode) {
    return <div className="flex-1" />;
  }

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    ctx?.onDeleteSpacer(itemKey);
  }

  return (
    <SortableItem id={itemKey} className="flex-1">
      {({ isDragging }) => (
        <div
          className={cn(
            "group relative flex control-min-sm min-w-8 flex-1 cursor-grab items-center justify-center rounded-md border border-dashed border-muted-foreground/40 px-2",
            isDragging && "opacity-40",
          )}
        >
          <span className="text-3xs text-muted-foreground/60 select-none">
            ⇔
          </span>
          <button
            className="absolute -top-1.5 -right-1.5 z-raised flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-destructive-foreground text-3xs cursor-pointer opacity-0 group-hover:opacity-80 hover:!opacity-100 transition-opacity"
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
  hiddenItems,
  onAddGroup,
  onAddSpacer,
  onRestore,
}: {
  hiddenItems: Array<{ key: string; label: string }>;
  /** Optional — the "Add Group" row is hidden when absent (e.g. field editor). */
  onAddGroup?: () => void;
  onAddSpacer: () => void;
  onRestore: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const hasHidden = hiddenItems.length > 0;

  function handleRestore(contributionId: string) {
    onRestore(contributionId);
  }

  return (
    <InlinePopover
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button
          variant="outline"
          size="sm"
          aria-label="Add items"
          className="border-dashed border-muted-foreground/40 text-muted-foreground hover:border-muted-foreground/70 hover:text-foreground"
        >
          <MdAdd className="size-3.5" />
          {hasHidden
            ? hiddenItems.length === 1
              ? "1 hidden"
              : `${hiddenItems.length} hidden`
            : "Add"}
        </Button>
      }
      contentClassName="w-56 p-0"
    >
      {hasHidden && (
          <div className="p-1">
            {hiddenItems.map((item) => (
              <Row
                key={item.key}
                size="sm"
                hover="accent"
                icon={<MdAdd className="shrink-0 text-muted-foreground" />}
                onClick={() => {
                  handleRestore(item.key);
                  if (hiddenItems.length <= 1) setOpen(false);
                }}
              >
                {item.label}
              </Row>
            ))}
          </div>
        )}

        <div className="border-t border-border p-1">
          {onAddGroup && (
            <Row
              size="sm"
              hover="accent"
              icon={<MdAdd className="shrink-0 text-muted-foreground" />}
              onClick={() => {
                onAddGroup();
                setOpen(false);
              }}
            >
              Add Group
            </Row>
          )}
          <Row
            size="sm"
            hover="accent"
            icon={<MdAdd className="shrink-0 text-muted-foreground" />}
            onClick={() => {
              onAddSpacer();
              setOpen(false);
            }}
          >
            Add Spacer
          </Row>
        </div>

        <div className="border-t border-border px-2.5 py-2">
          <Text
            as="div"
            variant="label"
            className="flex items-center gap-1.5 text-muted-foreground mb-1.5"
          >
            <MdStorefront className="size-3.5" />
            Marketplace
          </Text>
          <div className="relative">
            <MdSearch className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search..."
              className="h-7 pl-7 text-caption"
              disabled
            />
          </div>
          <Text
            as="p"
            variant="caption"
            className="mt-1.5 text-center text-muted-foreground/60"
          >
            No items
          </Text>
        </div>

        <div className="border-t border-border p-1">
          <Row
            size="sm"
            hover="accent"
            disabled
            icon={<MdAdd className="shrink-0" />}
          >
            Create custom plugin
          </Row>
        </div>
      </InlinePopover>
  );
}
