import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useMemo } from "react";
import { MdAdd, MdChevronRight, MdDragIndicator } from "react-icons/md";
import { useDraggable } from "@dnd-kit/core";
import { useBlockEditor } from "../block-editor-context";
import { useInsertBlockBelow } from "./use-insert-block-below";
import { BlockActionsMenu } from "./block-actions-menu";
import type { RailSeat } from "../internal/rail-seat";

/**
 * The hover rail: chevron, `+`, and the drag handle + actions menu, hanging back
 * into the gutter at -20 / -40 / -60 from `seat.left`.
 *
 * **It takes `{ seat }` and nothing else, and that is the point.** A void
 * container borrows its first child's line, so on that one line the rail's
 * controls must act on the CONTAINER while the row they are rendered by is the
 * child. Every earlier version of this markup lived inside `BlockRow` with
 * `block` in scope, and each control resolved ownership for itself — the chevron
 * from an explicit owner, `+`/drag/menu implicitly from `block`. Dragging the
 * handle on a callout's first line pulled that line out of the box.
 *
 * With no access to the row's own block, "this control targets the wrong block"
 * is not a bug to avoid here — it is unwriteable. Ownership is resolved once, in
 * `internal/rail-seat.ts`, where the whole flatten (and therefore the borrow
 * chain) is visible.
 */
export function BlockRail({ seat }: { seat: RailSeat }) {
  const { makeBlockAPI } = useBlockEditor();
  const insertBelow = useInsertBlockBelow();
  const owner = seat.owner.block;
  const chevron = seat.chevron;
  const api = useMemo(() => makeBlockAPI(owner.id), [makeBlockAPI, owner.id]);

  const { attributes, listeners, setNodeRef: setDragRef } = useDraggable({
    id: `drag:${owner.id}`,
    data: { id: owner.id },
  });

  return (
    <>
      {/* Chevron — collapses/expands the owning block's children. Usually the
          seat's owner, but NOT unconditionally: a first child that needs a
          chevron of its own keeps the single slot, because the container has a
          popover fallback and the child has none (see `resolveRailSeats`).
          Closest to the content; pinned visible while collapsed so hidden
          content is discoverable, otherwise hover-only like the +/drag cluster. */}
      {chevron && (
        <button
          type="button"
          aria-label={chevron.collapsed ? "Expand" : "Collapse"}
          aria-expanded={!chevron.collapsed}
          data-chevron-for={chevron.blockId}
          onClick={() => makeBlockAPI(chevron.blockId).setExpanded(chevron.collapsed)}
          // eslint-disable-next-line layout/no-adhoc-layout -- gutter handle positioned via JS coords (style left below); flex centering seats the glyph in the fixed-size button
          className={cn(
            "absolute block-gutter-control z-raised flex size-5 items-center justify-center rounded-md",
            "text-muted-foreground hover:bg-accent cursor-pointer",
            chevron.collapsed ? "opacity-60" : "opacity-0 pointer-events-none group-hover/row:opacity-60 group-hover/row:pointer-events-auto",
          )}
          style={{ left: seat.left - 20 }}
        >
          <MdChevronRight
            className={cn("size-4 transition-transform", !chevron.collapsed && "rotate-90")}
          />
        </button>
      )}
      {/* Gutter "+" — inserts an empty block below immediately, focuses it, and
          opens the shared caret-anchored block menu inline-filtered by the new
          block's own text (see `useInsertBlockBelow` + `BlockMenuPlugin`). On a
          BORROWED line the owner is the container, so `insertAfter` resolves the
          new sibling after the container's whole subtree — "new block after the
          callout", the same thing `+` already does on a toggle's line. */}
      <button
        type="button"
        aria-label="Insert block below"
        onClick={() => insertBelow(api)}
        // eslint-disable-next-line layout/no-adhoc-layout -- gutter handle positioned via JS coords (style left below); flex centering seats the glyph in the fixed-size button
        className={cn(
          "absolute block-gutter-control z-raised flex size-5 items-center justify-center rounded-md",
          "text-muted-foreground hover:bg-accent cursor-pointer",
          "opacity-0 pointer-events-none group-hover/row:opacity-60 group-hover/row:pointer-events-auto",
        )}
        style={{ left: seat.left - 60 }}
      >
        <MdAdd className="size-4" />
      </button>
      {/* Drag handle — drags to reorder (PointerSensor needs 4px movement),
          and a plain click opens the block-actions menu. That menu dispatches on
          the OWNER: an ordinary block gets turn-into / delete, a void container
          gets its appearance sections plus Collapse / Remove / Delete — which is
          why the container's own glyph no longer carries them.
          Dragging a borrowed line moves the WHOLE box: `move` reparents the one
          container row and its children follow by `parentId`. */}
      <BlockActionsMenu
        block={owner}
        api={api}
        childCount={seat.owner.childCount}
        align="start"
        side="bottom"
        trigger={
          <button
            type="button"
            ref={setDragRef}
            aria-label="Reorder or open block actions"
            {...attributes}
            {...listeners}
            // eslint-disable-next-line layout/no-adhoc-layout -- gutter handle positioned via JS coords (style left below); flex centering seats the glyph in the fixed-size button
            className={cn(
              "absolute block-gutter-control z-raised flex size-5 items-center justify-center rounded-md",
              "text-muted-foreground hover:bg-accent cursor-grab active:cursor-grabbing",
              "opacity-0 pointer-events-none group-hover/row:opacity-60 group-hover/row:pointer-events-auto",
            )}
            style={{ left: seat.left - 40 }}
          >
            <MdDragIndicator className="size-4" />
          </button>
        }
      />
    </>
  );
}
