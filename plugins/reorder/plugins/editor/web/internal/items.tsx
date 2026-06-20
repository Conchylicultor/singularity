import { Button, cn, Input } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { MdAdd, MdClose, MdSearch, MdStorefront } from "react-icons/md";
import { InlinePopover } from "@plugins/primitives/plugins/popover/web";
import { Row } from "@plugins/primitives/plugins/css/plugins/row/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Pin } from "@plugins/primitives/plugins/css/plugins/pin/web";
import { Inline } from "@plugins/primitives/plugins/css/plugins/inline/web";
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

// A fill contribution that forgets `reorderFill` works fine in normal mode (the
// wrapper is `display:contents` and the child participates in its host column
// directly) and only breaks in edit mode — a silent, mode-specific footgun. We
// can't infer "wants to fill" without the flag, but we CAN detect the symptom
// after mount and surface the missing opt-in loudly. Warn once per contribution.
const warnedMissingFill = new Set<string>();

// Descend past layout-neutral `display:contents` wrappers (e.g. the element-
// picker marker span) to the contribution's first real box.
function firstBoxDescendant(root: HTMLElement): HTMLElement | null {
  let el = root.firstElementChild as HTMLElement | null;
  while (el && getComputedStyle(el).display === "contents") {
    el = el.firstElementChild as HTMLElement | null;
  }
  return el;
}

export function SortableReorderItem({
  itemKey,
  editMode,
  label,
  fill = false,
  children,
}: {
  itemKey: string;
  editMode: boolean;
  label: string;
  /**
   * The contribution fills its host's height with an inner `flex-1 min-h-0`
   * scroll region (e.g. the conversations sidebar section). The edit-mode
   * wrapper must stay a bounded flex column at BOTH levels — the outer item box
   * and the inner content wrapper — so that scroll region clamps and scrolls
   * instead of expanding to its natural height and overflowing onto the rows
   * below. A non-fill row leaves both levels untouched.
   */
  fill?: boolean;
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

  // Loud detection of a missing `fill` opt-in: if the contribution's root box
  // declares `flex-grow` (it wants to fill its host's height and scroll), but
  // `fill` wasn't passed, the edit-mode wrapper isn't a bounded flex column, so
  // its content overflows onto sibling rows. Turn that silent visual bug into an
  // actionable console error instead of leaving authors to discover it by eye.
  useEffect(() => {
    if (!editMode || fill || isEmpty) return;
    const el = contentRef.current;
    if (!el) return;
    const root = firstBoxDescendant(el);
    if (!root) return;
    if (getComputedStyle(root).flexGrow !== "0" && !warnedMissingFill.has(itemKey)) {
      warnedMissingFill.add(itemKey);
      console.error(
        `[reorder] Contribution "${itemKey}" fills its host (its root sets ` +
          `flex-grow) but reorder was not told it fills: in edit mode its ` +
          `content overflows onto the rows below. Set \`reorderFill: true\` on ` +
          `its render-slot contribution.`,
      );
    }
  }, [editMode, fill, isEmpty, itemKey]);

  function handleHide(e: React.MouseEvent) {
    e.stopPropagation();
    ctx?.onHide(itemKey);
  }

  // The draggable edit-mode item box: a flex row (or a bounded flex-col when
  // `fill`) carrying drag chrome (cursor-grab, ring). The layout mode flips on
  // `fill` and rides with dnd-kit drag state, so the flex mechanics stay raw.
  const itemClassName = editMode
    ? ({ isDragging }: { isDragging: boolean }) =>
        // eslint-disable-next-line layout/no-adhoc-layout -- draggable edit-mode item box; layout mode flips on fill + dnd drag chrome
        cn(
          // `control-min-sm` + centered content gives every edit-mode box a
          // uniform height floor (matching the spacer and Add button) so
          // heterogeneous contributions don't render ragged rings. Horizontal
          // boxes hug their content; vertical boxes span the column (`w-full`)
          // like the un-wrapped list rows they replace.
          "group/reorder-item relative flex control-min-sm items-center cursor-grab rounded-md ring-1 ring-primary/50",
          isHorizontal ? "" : "w-full",
          // Fill contributions span the column height as a bounded flex column
          // so their inner scroll region clamps (see `fill` docs).
          fill && "flex-col flex-1 min-h-0",
          isDragging && "opacity-40",
        )
    : "contents";

  return (
    <SortableItem id={itemKey} disabled={!editMode} className={itemClassName}>
      {() => (
        <>
          {editMode && (
            // Hover-revealed × badge overhanging the item's top-right corner by
            // a fixed pixel amount (off the density ramp) — drag-affordance
            // chrome, kept as raw positioning.
            <button
              // eslint-disable-next-line layout/no-adhoc-layout -- hover-revealed × badge overhanging the draggable item corner (off-ramp pixel overhang)
              className="absolute -top-1.5 -right-1.5 z-raised flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-destructive-foreground text-3xs cursor-pointer opacity-0 pointer-events-none group-hover/reorder-item:opacity-80 group-hover/reorder-item:pointer-events-auto hover:!opacity-100 hover:pointer-events-auto transition-opacity"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={handleHide}
              aria-label="Hide item"
            >
              <MdClose className="size-2.5" />
            </button>
          )}
          <div
            ref={contentRef}
            // The fill branch turns this wrapper into a bounded flex column so a
            // contribution's inner `flex-1 min-h-0` scroll region clamps instead
            // of overflowing — a conditional layout bound tied to the fill/edit
            // machinery, kept raw.
            // eslint-disable-next-line layout/no-adhoc-layout -- conditional fill bound (bounded flex column) for the edit-mode content wrapper
            className={cn(
              editMode ? "pointer-events-none" : "contents",
              // Fill the box so full-width vertical rows keep spanning the column.
              // Skip when empty — an empty `w-full` div would steal the whole row
              // from the placeholder sibling, wrapping its label onto two lines.
              editMode && !isHorizontal && !isEmpty && "w-full",
              // Propagate the fill bound to the content wrapper too, so the
              // contribution's inner `flex-1 min-h-0` scroll region resolves
              // against a bounded box instead of growing to its natural height.
              editMode && fill && !isEmpty && "flex flex-col flex-1 min-h-0 overflow-hidden",
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
    // A spacer is a flex-grow gap that absorbs the slack between siblings.
    // eslint-disable-next-line layout/no-adhoc-layout -- flex-grow spacer gap absorbing slack between slot contributions
    return <div className="flex-1" />;
  }

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    ctx?.onRemoveNode(itemKey);
  }

  return (
    // The SortableItem wrapper inherits the spacer's flex-grow role so the
    // draggable placeholder still absorbs slack like the live gap it replaces.
    // eslint-disable-next-line layout/no-adhoc-layout -- flex-grow spacer placeholder absorbing slack
    <SortableItem id={itemKey} className="flex-1">
      {({ isDragging }) => (
        // The draggable dashed spacer placeholder: a flex-grow, centered box
        // carrying drag chrome (cursor-grab, dashed ring).
        <div
          // eslint-disable-next-line layout/no-adhoc-layout -- draggable flex-grow spacer placeholder with drag chrome
          className={cn(
            "group relative flex control-min-sm min-w-8 flex-1 cursor-grab items-center justify-center rounded-md border border-dashed border-muted-foreground/40 px-sm",
            isDragging && "opacity-40",
          )}
        >
          <span className="text-3xs text-muted-foreground/60 select-none">
            ⇔
          </span>
          <button
            // eslint-disable-next-line layout/no-adhoc-layout -- hover-revealed × badge overhanging the spacer corner (off-ramp pixel overhang)
            className="absolute -top-1.5 -right-1.5 z-raised flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-destructive-foreground text-3xs cursor-pointer opacity-0 pointer-events-none group-hover:opacity-80 group-hover:pointer-events-auto hover:!opacity-100 hover:pointer-events-auto transition-opacity"
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
                icon={<MdAdd className="text-muted-foreground" />}
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
                icon={<MdAdd className="text-muted-foreground" />}
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
          <Inline
            as="div"
            gap="xs"
            // eslint-disable-next-line spacing/no-adhoc-spacing -- bottom offset separating the Marketplace label from the search input
            className="text-muted-foreground mb-1.5"
          >
            <MdStorefront className="size-3.5" />
            <Text as="span" variant="label">
              Marketplace
            </Text>
          </Inline>
          <div className="relative">
            {/* Decorative search glyph pinned to the input's left edge, vertically centered. `left-2` (0.5rem) is off the density ramp → inline-style offset. */}
            <Pin
              to="left"
              decorative
              style={{ left: "0.5rem" }}
              className="size-3.5 text-muted-foreground"
            >
              <MdSearch className="size-3.5" />
            </Pin>
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
            icon={<MdAdd />}
          >
            Create custom plugin
          </Row>
        </div>
      </InlinePopover>
  );
}
