import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useMemo, type CSSProperties } from "react";
import { MdAdd, MdChevronRight, MdDragIndicator } from "react-icons/md";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import type { DropZone } from "@plugins/primitives/plugins/tree/core";
import { useMultiSelectItem } from "@plugins/primitives/plugins/multi-select/web";
import type { Block, BlockHandle, BlockTextVariant } from "../../core";
import { useBlockEditor } from "../block-editor-context";
import { useSelectionControl } from "../selection-control";
import { Editor, useBlockAnchors } from "../slots";
import { useInsertBlockBelow } from "./use-insert-block-below";
import { BlockActionsMenu } from "./block-actions-menu";
import { BLOCK_INDENT, blockContentLeft } from "../internal/page-column";
import "./block-document-scale.css";

// Per-variant text line-height, as a reference to the single-sourced `--doc-lh-*`
// var (defined in block-document-scale.css). Drives the DEFAULT gutter seat: a
// text block's first line sits at `py-xs + line-height/2`. A block that renders
// its first line elsewhere overrides the whole center via
// `handle.gutterFirstLineCenter` (callout, link-to-page, sub-page, divider, …).
const DOC_LINE_HEIGHT: Record<BlockTextVariant, string> = {
  title: "var(--doc-lh-title)",
  heading: "var(--doc-lh-heading)",
  subheading: "var(--doc-lh-subheading)",
  body: "var(--doc-lh-body)",
  label: "var(--doc-lh-label)",
  caption: "var(--doc-lh-caption)",
};

/**
 * Where a block's gutter controls seat vertically: a CSS length from the row's
 * top edge to the CENTER of its first rendered line. A block may override the
 * whole center (its first line isn't a plain text line); otherwise it is the
 * standard text seat, `py-xs + variant-line-height/2`.
 *
 * Exported because a container ANCHOR has no line of its own and must BORROW its
 * first visible child's seat — `block-editor.tsx` resolves that from the child's
 * handle through this same function, so the two call sites cannot drift.
 */
export function gutterFirstLineCenter(handle: BlockHandle<unknown> | undefined): string {
  return (
    handle?.gutterFirstLineCenter ??
    `calc(var(--space-xs) + ${DOC_LINE_HEIGHT[handle?.textVariant ?? "body"]} / 2)`
  );
}

/** One empty body line plus the standard row padding — the childless-anchor box. */
const ONE_EMPTY_LINE = "calc(var(--space-xs) * 2 + var(--doc-lh-body))";

// The column geometry (rail width, per-depth indent, content inset) lives in
// `../internal/page-column` — see its module doc for the invariant. Hosts align
// their own chrome onto the block content edge via `PageContentColumn`, never by
// re-deriving it from `BLOCK_GUTTER`.

export function BlockRow({
  block,
  depth,
  hasChildren,
  hasVisibleChildren,
  ordinal,
  isDragging,
  dropZone,
  railLeft,
  borrowedFirstLineCenter,
}: {
  block: Block;
  depth: number;
  /** Whether this block has children (drives the collapse chevron). */
  hasChildren: boolean;
  /** Whether those children are currently rendered below this row. */
  hasVisibleChildren: boolean;
  /** 1-based position within the consecutive run of same-type siblings (ordinal-marker blocks). */
  ordinal: number;
  isDragging: boolean;
  /** Where the dragged block would land relative to this row, or null. */
  dropZone: DropZone | null;
  /**
   * Where this row seats its hover rail: the content edge of its OUTERMOST
   * enclosing container frame, or its own when unframed. Resolved by the editor
   * from the frame spans it already computes — a row never derives it (see
   * `internal/page-column.ts`).
   */
  railLeft: number;
  /**
   * A container ANCHOR's borrowed first-line center: it renders no line of its
   * own, so the editor resolves the seat from its first visible child's handle.
   * Absent for every ordinary row, which reads its own handle.
   */
  borrowedFirstLineCenter?: string;
}) {
  const { focusedBlockId, makeBlockAPI } = useBlockEditor();
  const insertBelow = useInsertBlockBelow();
  const api = useMemo(() => makeBlockAPI(block.id), [makeBlockAPI, block.id]);
  const isFocused = focusedBlockId === block.id;
  const { isSelected } = useMultiSelectItem(block.id);
  const selection = useSelectionControl();

  // Show a collapse chevron when the block has children, or always for block
  // types that opt in (e.g. the toggle block). Read generically from the handle.
  // `collapsible: "never"` suppresses it outright: the flatten ignores `expanded`
  // for those types, so a chevron would be a control over an inert flag.
  const contributions = Editor.Block.useContributions();
  const handle = contributions.find((c) => c.block.type === block.type)?.block;
  const showChevron =
    handle?.collapsible !== "never" && (hasChildren || handle?.collapsible === "always");
  const collapsed = !block.expanded;
  const anchors = useBlockAnchors();
  const Anchor = anchors.get(block.type);

  const { attributes, listeners, setNodeRef: setDragRef } = useDraggable({
    id: `drag:${block.id}`,
    data: { id: block.id },
  });
  // One droppable per row; the editor's drag handler resolves before/after/child
  // from the pointer's position within this rect (single target → single line).
  const { setNodeRef: setDropRef } = useDroppable({ id: block.id });

  // Left edge of this row's content, measured from the row's own border box.
  // The gutter rail lives in the row's padding, so every offset below is
  // relative to the row. The controls hang back into the rail at `railLeft`
  // (this row's own content edge, or its enclosing frame's — see the prop), and
  // a drop lands as a sibling of this row, so the line sits at this row's depth.
  const contentLeft = blockContentLeft(depth);
  const firstLineCenter = borrowedFirstLineCenter ?? gutterFirstLineCenter(handle);

  const dropIndicator = (zone: DropZone) => (
    <div
      // eslint-disable-next-line layout/no-adhoc-layout -- drop indicator positioned via JS-computed left coord (style below) + right-1/top-0/bottom-0 edge pins; not a ramp-expressible anchor
      className={cn(
        "bg-primary pointer-events-none absolute right-1 z-raised h-[2px] rounded-full",
        zone === "before" ? "top-0" : "bottom-0",
      )}
      style={{ left: contentLeft + 4 }}
    >
      {/* eslint-disable-next-line layout/no-adhoc-layout -- decorative endpoint dot offset onto the line via fractional negative coords */}
      <div className="bg-primary absolute -left-1 -top-[3px] size-2 rounded-full" />
    </div>
  );

  // ---- Container ANCHOR row -------------------------------------------------
  //
  // A type declaring `BlockHandle.anchor` renders no line: its content IS its
  // children. Three things follow, none of them optional:
  //
  //  - **No rail controls.** Its slots would be identical to its first child's,
  //    on the same visual line, and the child must keep its own handle. The
  //    container is manipulated through its decoration instead (drag from the
  //    column below; the contribution owns the click).
  //  - **Zero height while children are visible**, so the decoration and the
  //    first child share one line. The row is `relative` and nothing in the
  //    chain clips, so the absolutely-positioned column escapes it fine.
  //  - **A one-line box when childless.** `computeFrameSpans` deliberately spans
  //    a childless container over its own row alone, so at zero height the frame
  //    would paint a 0px box over a 0px row: invisible, unclickable,
  //    undeletable. The fallback is a hard requirement, not polish.
  if (handle?.anchor === true) {
    return (
      <div
        ref={setDropRef}
        data-block-id={block.id}
        className="group/row relative"
        style={
          {
            paddingLeft: contentLeft,
            "--gutter-first-line-center": firstLineCenter,
          } as CSSProperties
        }
      >
        {/* The decoration column: exactly one BLOCK_INDENT wide, flush at the
            container's content edge `C`, so it sits in the gap the enclosed
            rows' rail no longer occupies (they seat theirs at the frame's edge).
            `z-raised` puts it above the frame it decorates. Draggable here
            rather than in the contribution: the surface owns the geometry AND
            the structural affordance, exactly as it does for an ordinary row's
            drag handle — the contribution renders appearance + click. */}
        <div
          ref={setDragRef}
          {...attributes}
          {...listeners}
          // eslint-disable-next-line layout/no-adhoc-layout -- anchor column positioned via JS coords (style left/width below); `.block-anchor` owns the borrowed-first-line vertical seat
          className={cn("block-anchor absolute z-raised", isDragging && "opacity-40")}
          style={{ left: contentLeft, width: BLOCK_INDENT }}
        >
          {Anchor ? (
            // eslint-disable-next-line react-hooks/static-components -- not a component CREATED during render: `Anchor` is a registry LOOKUP into the memoized `useBlockAnchors()` map, whose values are module-level slot contributions. Its identity is stable across renders, so no state can reset.
            <Anchor id={block.id} type={block.type} data={block.data} editor={api} />
          ) : null}
        </div>
        {/* Childless fallback: one empty body line so the frame has a real box
            to paint, and the container stays selectable and deletable. */}
        {!hasVisibleChildren && <div style={{ minHeight: ONE_EMPTY_LINE }} />}
        {/* On a zero-height row both drop arms land on the same y, and after the
            editor's `rowAtPointer` height guard an anchor can only ever resolve
            to `before` — so render that arm alone. The childless fallback has a
            real box, so it honors the resolved zone. */}
        {dropZone && dropIndicator(hasVisibleChildren ? "before" : dropZone)}
      </div>
    );
  }

  return (
    <div
      ref={setDropRef}
      data-block-id={block.id}
      className="group/row relative"
      style={{ paddingLeft: contentLeft, "--gutter-first-line-center": firstLineCenter } as CSSProperties}
    >
      {/* Chevron — collapses/expands this block's children. Closest to the
          content; pinned visible while collapsed so hidden content is
          discoverable, otherwise hover-only like the +/drag cluster. */}
      {showChevron && (
        <button
          type="button"
          aria-label={collapsed ? "Expand" : "Collapse"}
          aria-expanded={!collapsed}
          onClick={() => api.setExpanded(collapsed)}
          // eslint-disable-next-line layout/no-adhoc-layout -- gutter handle positioned via JS coords (style left below); flex centering seats the glyph in the fixed-size button
          className={cn(
            "absolute block-gutter-control z-raised flex size-5 items-center justify-center rounded-md",
            "text-muted-foreground hover:bg-accent cursor-pointer",
            collapsed ? "opacity-60" : "opacity-0 pointer-events-none group-hover/row:opacity-60 group-hover/row:pointer-events-auto",
          )}
          style={{ left: railLeft - 20 }}
        >
          <MdChevronRight className={cn("size-4 transition-transform", !collapsed && "rotate-90")} />
        </button>
      )}
      {/* Gutter "+" — inserts an empty block below immediately, focuses it, and
          opens the shared caret-anchored block menu inline-filtered by the new
          block's own text (see `useInsertBlockBelow` + `BlockMenuPlugin`). */}
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
        style={{ left: railLeft - 60 }}
      >
        <MdAdd className="size-4" />
      </button>
      {/* Drag handle — drags to reorder (PointerSensor needs 4px movement),
          and a plain click opens the block-actions (turn into / delete) menu. */}
      <BlockActionsMenu
        block={block}
        api={api}
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
            style={{ left: railLeft - 40 }}
          >
            <MdDragIndicator className="size-4" />
          </button>
        }
      />
      {/* Shift+click anywhere on the row extends the block selection instead of
          placing a caret. mousedown + preventDefault stops the text selection /
          focus that a click would otherwise start. */}
      <div
        className={cn(
          "rounded-md",
          isDragging && "opacity-40",
          isSelected && "bg-primary/10 ring-primary/30 ring-1",
        )}
        onMouseDownCapture={(e) => {
          if (e.shiftKey && selection) {
            e.preventDefault();
            selection.extendTo(block.id);
          }
        }}
      >
        <Editor.Block.Dispatch block={block} isFocused={isFocused} editor={api} ordinal={ordinal} />
      </div>
      {dropZone && dropIndicator(dropZone)}
    </div>
  );
}
