import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useMemo, type ComponentPropsWithoutRef, type Ref } from "react";
import { MdAdd, MdChevronRight, MdDragIndicator } from "react-icons/md";
import { useDraggable } from "@dnd-kit/core";
import { useBlockEditor } from "../block-editor-context";
import { useInsertBlockBelow } from "./use-insert-block-below";
import { BlockActionsMenu } from "./block-actions-menu";
import type { RailSeat } from "../internal/rail-seat";

/** Hover-only reveal, shared by the `+`/drag cluster and by an EXPANDED chevron. */
const REVEAL_ON_ROW_HOVER =
  "opacity-0 pointer-events-none group-hover/row:opacity-60 group-hover/row:pointer-events-auto";

interface RailButtonProps extends ComponentPropsWithoutRef<"button"> {
  /** Gutter x-offset in row coordinates — `seat.left - 20 / 40 / 60`. */
  left: number;
  ref?: Ref<HTMLButtonElement>;
}

/**
 * The ONE `<button>` on the rail. Every gutter control routes through it, so the
 * rule below cannot be reintroduced-around by a future control.
 *
 * > **The rail ACTS ON a block. It never takes the keyboard away from the surface
 * > that owns block-selection mode.**
 *
 * That is what the `onMouseDown` `preventDefault` is — not noise, do not delete
 * it. Block-selection mode is **focus-scoped**: `useBlockSelection`'s
 * `onFocusCapture` ends the selection the moment focus lands anywhere but the
 * block-list container (which is what keeps the highlighted selection and the
 * live keyboard in agreement — `onKeyDown` answers only to
 * `e.target === container`). Pressing a `<button>` focuses it, so without this
 * the mousedown on the drag handle cleared the selection *before* dnd-kit's 4px
 * activation distance was travelled, and every multi-block drag silently
 * degraded to a single-block `move`.
 *
 * **`onMouseDown`, not `onMouseDownCapture`** — even though the drag handle is
 * also the block-actions popover trigger, which Base UI clones via
 * `<Popover.Trigger render={…}>`. Its `mergeProps(baseProps, render.props)`
 * CHAINS same-named event handlers rather than overwriting them, and the render
 * element's handler runs FIRST (only an explicit `preventBaseUIHandler()` would
 * suppress Base UI's own), so ours survives the merge. (`block-row.tsx` uses the
 * capture form for a different reason: it must beat Lexical's own listener on
 * the contenteditable below it.)
 *
 * Nothing downstream needs the press's default action: dnd-kit's `PointerSensor`
 * activates off `pointerdown`, the popover opens on `click` (`useClick`'s default
 * `event: "click"` makes its own `onMouseDown` a no-op), and the popover's
 * close-autofocus restores focus by an explicit `.focus()` call. Tab still
 * focuses the handle, so keyboard access to the actions menu is unchanged.
 */
function RailButton({ left, className, ref, ...rest }: RailButtonProps) {
  return (
    <button
      type="button"
      ref={ref}
      // eslint-disable-next-line layout/no-adhoc-layout -- gutter handle positioned via JS coords (style left below); flex centering seats the glyph in the fixed-size button
      className={cn(
        "absolute block-gutter-control z-raised flex size-5 items-center justify-center rounded-md",
        "text-muted-foreground hover:bg-accent cursor-pointer",
        className,
      )}
      style={{ left }}
      {...rest}
      // LAST, deliberately: this is the rail's one rule, so no call site's own
      // props (the drag handle spreads dnd-kit's listeners here) can displace it.
      onMouseDown={(e) => e.preventDefault()}
    />
  );
}

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
 *
 * Every control is a `RailButton` — read its note before adding a fourth one, or
 * before writing a raw `<button>` beside them.
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
        <RailButton
          left={seat.left - 20}
          aria-label={chevron.collapsed ? "Expand" : "Collapse"}
          aria-expanded={!chevron.collapsed}
          data-chevron-for={chevron.blockId}
          onClick={() => makeBlockAPI(chevron.blockId).setExpanded(chevron.collapsed)}
          className={chevron.collapsed ? "opacity-60" : REVEAL_ON_ROW_HOVER}
        >
          <MdChevronRight
            className={cn("size-4 transition-transform", !chevron.collapsed && "rotate-90")}
          />
        </RailButton>
      )}
      {/* Gutter "+" — inserts an empty block below immediately, focuses it, and
          opens the shared caret-anchored block menu inline-filtered by the new
          block's own text (see `useInsertBlockBelow` + `BlockMenuPlugin`). On a
          BORROWED line the owner is the container, so `insertAfter` resolves the
          new sibling after the container's whole subtree — "new block after the
          callout", the same thing `+` already does on a toggle's line. */}
      <RailButton
        left={seat.left - 60}
        aria-label="Insert block below"
        onClick={() => insertBelow(api)}
        className={REVEAL_ON_ROW_HOVER}
      >
        <MdAdd className="size-4" />
      </RailButton>
      {/* Drag handle — drags to reorder (PointerSensor needs 4px movement),
          and a plain click opens the block-actions menu. That menu dispatches on
          the OWNER: an ordinary block gets turn-into / delete, a void container
          gets its appearance sections plus Collapse / Remove / Delete — which is
          why the container's own glyph no longer carries them.
          Dragging a borrowed line moves the WHOLE box: `move` reparents the one
          container row and its children follow by `parentId`.
          Dragging a block that IS in a live block selection moves the whole
          selection — which only works because `RailButton` keeps the press from
          focusing (and therefore clearing) it. */}
      <BlockActionsMenu
        block={owner}
        api={api}
        childCount={seat.owner.childCount}
        align="start"
        side="bottom"
        trigger={
          <RailButton
            left={seat.left - 40}
            ref={setDragRef}
            aria-label="Reorder or open block actions"
            {...attributes}
            {...listeners}
            className={cn("cursor-grab active:cursor-grabbing", REVEAL_ON_ROW_HOVER)}
          >
            <MdDragIndicator className="size-4" />
          </RailButton>
        }
      />
    </>
  );
}
