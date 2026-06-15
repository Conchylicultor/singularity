import { Button, cn, Input } from "@plugins/primitives/plugins/ui-kit/web";
import { createContext, useContext, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { MdAdd, MdClose, MdSearch, MdStorefront } from "react-icons/md";
import { InlinePopover } from "@plugins/primitives/plugins/popover/web";
import { Row } from "@plugins/primitives/plugins/row/web";
import { Text } from "@plugins/primitives/plugins/text/web";
import { SortableItem } from "@plugins/primitives/plugins/sortable-list/web";

// --- Area context ------------------------------------------------------------

// Read by the item-internal affordances (hide button, node remove button). The
// editor provides it; both the reorder middleware and the config field renderer
// flow through the same context.
export type ReorderAreaCtxValue = {
  orientation: "horizontal" | "vertical";
  /** Hide a contribution by id (its entryKey). */
  onHide: (id: string) => void;
  /** Remove a node (e.g. a spacer) by id. */
  onRemoveNode: (id: string) => void;
};

export const ReorderAreaContext = createContext<ReorderAreaCtxValue | null>(
  null,
);

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
              // A vertical contribution whose body fills its host via an inner
              // `flex-1 min-h-0` scroll region (e.g. the conversations sidebar
              // section) needs this wrapper to stay bounded too — otherwise the
              // scroll region resolves against unbounded height, expands to its
              // full natural size, and overflows onto the rows below. Mirroring
              // the contribution's opt-in fill (`reorderWrapperClassName: "flex
              // flex-col flex-1 min-h-0"`) here as a flex column re-establishes
              // the bound: the body becomes a `flex-1 min-h-0` child of a bounded
              // box, so its scroll region clamps and scrolls instead of growing.
              // For a normal row the outer wrapper is a row flex, so `flex-1`
              // just spans the width and the column has a single child — inert.
              editMode && !isHorizontal && !isEmpty && "flex flex-col min-h-0 flex-1 overflow-hidden",
            )}
          >
            {children}
          </div>
          {editMode && isEmpty && (
            <div
              className={cn(
                "pointer-events-none select-none italic text-muted-foreground/50",
                isHorizontal
                  ? "px-sm py-2xs text-3xs max-w-24 truncate"
                  : "w-full px-md py-xs text-center text-caption",
              )}
            >
              {label}
            </div>
          )}
        </>
      )}
    </SortableItem>
  );
}

// --- Spacer reorder item -----------------------------------------------------

// A spacer renders as a flex gap. In edit mode it becomes a draggable, dashed
// placeholder with a delete button; the node is removed from the `items` tree
// via `ctx.onRemoveNode`.
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
    ctx?.onRemoveNode(itemKey);
  }

  return (
    <SortableItem id={itemKey} className="flex-1">
      {({ isDragging }) => (
        <div
          className={cn(
            "group relative flex control-min-sm min-w-8 flex-1 cursor-grab items-center justify-center rounded-md border border-dashed border-muted-foreground/40 px-sm",
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
  inserts,
  onRestore,
}: {
  hiddenItems: Array<{ key: string; label: string }>;
  /** Registry-driven insert affordances (e.g. "Add Spacer"). */
  inserts: Array<{ label: string; onInsert: () => void }>;
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
      contentClassName="w-56 p-none"
    >
      {hasHidden && (
          <div className="p-xs">
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

        {inserts.length > 0 && (
          <div className="border-t border-border p-xs">
            {inserts.map((insert) => (
              <Row
                key={insert.label}
                size="sm"
                hover="accent"
                icon={<MdAdd className="shrink-0 text-muted-foreground" />}
                onClick={() => {
                  insert.onInsert();
                  setOpen(false);
                }}
              >
                {insert.label}
              </Row>
            ))}
          </div>
        )}

        <div className="border-t border-border px-sm py-sm">
          <Text
            as="div"
            variant="label"
            // eslint-disable-next-line spacing/no-adhoc-spacing -- bottom offset separating the Marketplace label from the search input
            className="flex items-center gap-xs text-muted-foreground mb-1.5"
          >
            <MdStorefront className="size-3.5" />
            Marketplace
          </Text>
          <div className="relative">
            <MdSearch className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search..."
              // eslint-disable-next-line spacing/no-adhoc-spacing -- precise left padding clearing the absolutely-positioned search icon
              className="h-7 pl-7 text-caption"
              disabled
            />
          </div>
          <Text
            as="p"
            variant="caption"
            // eslint-disable-next-line spacing/no-adhoc-spacing -- top offset separating the empty-state text from the search input above
            className="mt-1.5 text-center text-muted-foreground/60"
          >
            No items
          </Text>
        </div>

        <div className="border-t border-border p-xs">
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
