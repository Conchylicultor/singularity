import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useMemo, type CSSProperties } from "react";
import { useDroppable } from "@dnd-kit/core";
import type { DropZone } from "@plugins/primitives/plugins/tree/core";
import type { Block } from "../../core";
import { useBlockEditor } from "../block-editor-context";
import { useSelectionControl } from "../selection-control";
import { Editor, useBlockAnchors } from "../slots";
import { BlockRail } from "./block-rail";
import { BLOCK_INDENT, blockContentLeft } from "../internal/page-column";
import { gutterFirstLineCenter, type RailSeat } from "../internal/rail-seat";
import "./block-document-scale.css";

/** One empty body line plus the standard row padding — the childless-anchor box. */
const ONE_EMPTY_LINE = "calc(var(--space-xs) * 2 + var(--doc-lh-body))";

// The anchor decoration's own column. Hoisted out of the JSX so its lint
// suppression sits on a line prettier cannot reflow — a positional
// `eslint-disable-next-line` inside a JSX attribute is one format pass away from
// suppressing different code (`format-clean` fails the build on exactly that).
// eslint-disable-next-line layout/no-adhoc-layout -- positioned via JS coords (style left/width at the use site); `.block-anchor` owns the borrowed-first-line vertical seat
const ANCHOR_COLUMN = "block-anchor absolute z-raised";

// The selection marker: a selected block SAYS "Selected." to a screen reader,
// because it has no attribute with which to be selected.
//
// `aria-selected` is supported only on `option`, `row`, `gridcell`, `tab`,
// `treeitem`, `columnheader` and `rowheader` — and none of those may host a
// `contenteditable`, which every row here does. So the state has no native
// carrier and becomes a word instead. `sr-only` is `position: absolute`, so it
// perturbs no rect that drag, drop or the marquee measures.
//
// Rendered ALWAYS, empty when unselected, never mounted conditionally: the row's
// children list must keep a constant length (the fiber-index pairing hazard
// `text-block-layout.tsx` documents). The full rationale — and why `role="option"`
// must not be re-added — is in this plugin's `CLAUDE.md`, under
// *The block list is a document, not a listbox*.
function SelectionMarker({ isSelected }: { isSelected: boolean }) {
  return <span className="sr-only">{isSelected ? "Selected. " : ""}</span>;
}

// The column geometry (rail width, per-depth indent, content inset) lives in
// `../internal/page-column` — see its module doc for the invariant. Hosts align
// their own chrome onto the block content edge via `PageContentColumn`, never by
// re-deriving it from `BLOCK_GUTTER`.

export function BlockRow({
  block,
  depth,
  hasVisibleChildren,
  ordinal,
  isDragging,
  isSelected,
  dropZone,
  seat,
}: {
  block: Block;
  depth: number;
  /** Whether this block's children are currently rendered below this row. */
  hasVisibleChildren: boolean;
  /** 1-based position within the consecutive run of same-type siblings (ordinal-marker blocks). */
  ordinal: number;
  isDragging: boolean;
  /**
   * Whether this block is in the current block selection. Handed down by the
   * editor, which already holds `selectedIds` — NOT read from the selection store
   * here, which would newly subscribe every row to it. The editor re-renders every
   * row on a selection change anyway (it recomputes the selection bands), so the
   * prop is free and the subscription would not be.
   *
   * The row paints nothing for it. Selection is a decoration over the RUN of
   * selected lines, and the only thing this adds is the `sr-only` word below.
   */
  isSelected: boolean;
  /** Where the dragged block would land relative to this row, or null. */
  dropZone: DropZone | null;
  /**
   * This row's resolved RAIL SEAT: where the hover controls sit, which block
   * they act on, and — for a container anchor — the first-line center it borrows
   * from its first child. Resolved by the editor with the whole flatten in view
   * (`internal/rail-seat.ts`), because neither the geometry (a row's outermost
   * enclosing FRAME) nor the ownership (the borrow chain above it) is knowable
   * from a row alone. The row hands it straight to `<BlockRail>` without reading
   * the owner: keeping `block` and `seat.owner` apart in separate components is
   * what makes a control targeting the wrong block unwriteable.
   */
  seat: RailSeat;
}) {
  const { focusedBlockId, makeBlockAPI } = useBlockEditor();
  const api = useMemo(() => makeBlockAPI(block.id), [makeBlockAPI, block.id]);
  const isFocused = focusedBlockId === block.id;
  const selection = useSelectionControl();

  const contributions = Editor.Block.useContributions();
  const handle = contributions.find((c) => c.block.type === block.type)?.block;
  const anchors = useBlockAnchors();
  const Anchor = anchors.get(block.type);

  // One droppable per row; the editor's drag handler resolves before/after/child
  // from the pointer's position within this rect (single target → single line).
  // Drop targets stay strictly per-row — only the RAIL's controls follow the
  // seat's owner, so a drop still lands relative to the line under the pointer.
  const { setNodeRef: setDropRef } = useDroppable({ id: block.id });

  // Left edge of this row's content, measured from the row's own border box.
  // The gutter rail lives in the row's padding, so every offset is relative to
  // the row; the rail's own controls hang back from `seat.left` (this row's
  // content edge, or its enclosing frame's), which is the rail's business, not
  // this row's. A drop lands as a sibling of this row, so the line sits at this
  // row's depth.
  const contentLeft = blockContentLeft(depth);
  const firstLineCenter =
    seat.borrowedFirstLineCenter ?? gutterFirstLineCenter(handle);

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
  //  - **No rail of its own.** Its slots would be identical to its first child's,
  //    on the same visual line. That line's rail is the container's — the seat
  //    resolver hands it the container as its owner — so a second one here would
  //    be a duplicate set of controls (and a second dnd-kit draggable under the
  //    same `drag:<id>`) for one visual line. The decoration below is appearance
  //    and its own click surface, nothing structural.
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
        <SelectionMarker isSelected={isSelected} />
        {/* The decoration column: exactly one BLOCK_INDENT wide, flush at the
            container's content edge `C`, so it sits in the gap the enclosed
            rows' rail no longer occupies (they seat theirs at the frame's edge).
            `z-raised` puts it above the frame it decorates. */}
        <div
          className={cn(ANCHOR_COLUMN, isDragging && "opacity-40")}
          style={{ left: contentLeft, width: BLOCK_INDENT }}
        >
          {Anchor ? (
            // eslint-disable-next-line react-hooks/static-components -- not a component CREATED during render: `Anchor` is a registry LOOKUP into the memoized `useBlockAnchors()` map, whose values are module-level slot contributions. Its identity is stable across renders, so no state can reset.
            <Anchor
              type={block.type}
              data={block.data}
              blockId={block.id}
              editor={api}
            />
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
      style={
        {
          paddingLeft: contentLeft,
          "--gutter-first-line-center": firstLineCenter,
        } as CSSProperties
      }
    >
      <SelectionMarker isSelected={isSelected} />
      <BlockRail seat={seat} />
      {/* Shift+click anywhere on the row extends the block selection instead of
          placing a caret. mousedown + preventDefault stops the text selection /
          focus that a click would otherwise start.

          A row paints NO selection highlight of its own: the highlight belongs
          to the RUN of selected lines, not to one row, so it is a sibling
          decoration over the list's grid (`components/selection-bands.tsx`). */}
      <div
        className={cn(isDragging && "opacity-40")}
        onMouseDownCapture={(e) => {
          if (e.shiftKey && selection) {
            e.preventDefault();
            selection.extendTo(block.id);
          }
        }}
      >
        <Editor.Block.Dispatch
          block={block}
          isFocused={isFocused}
          editor={api}
          ordinal={ordinal}
        />
      </div>
      {dropZone && dropIndicator(dropZone)}
    </div>
  );
}
