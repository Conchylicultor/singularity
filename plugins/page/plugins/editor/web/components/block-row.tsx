import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useMemo, type CSSProperties } from "react";
import { MdAdd, MdChevronRight, MdDragIndicator } from "react-icons/md";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import type { DropZone } from "@plugins/primitives/plugins/tree/core";
import { useMultiSelectItem } from "@plugins/primitives/plugins/multi-select/web";
import type { Block, BlockTextVariant } from "../../core";
import { useBlockEditor } from "../block-editor-context";
import { useSelectionControl } from "../selection-control";
import { Editor } from "../slots";
import { useInsertBlockBelow } from "./use-insert-block-below";
import { BlockActionsMenu } from "./block-actions-menu";
import { BLOCK_GUTTER, BLOCK_INDENT } from "../internal/page-column";
import "./block-document-scale.css";

// The block's first-line height, as a reference to the single-sourced
// `--doc-lh-*` var (defined in block-document-scale.css). block-row feeds this to
// `--gutter-line-height` so `.block-gutter-control` seats the +/drag/chevron on
// the center of the block's first text line — whatever its variant. A block with
// no text variant (image, divider, …) falls back to body.
const GUTTER_LINE_HEIGHT: Record<BlockTextVariant, string> = {
  title: "var(--doc-lh-title)",
  heading: "var(--doc-lh-heading)",
  subheading: "var(--doc-lh-subheading)",
  body: "var(--doc-lh-body)",
  label: "var(--doc-lh-label)",
  caption: "var(--doc-lh-caption)",
};

// The column geometry (rail width, per-depth indent, content inset) lives in
// `../internal/page-column` — see its module doc for the invariant. Hosts align
// their own chrome onto the block content edge via `PageContentColumn`, never by
// re-deriving it from `BLOCK_GUTTER`.

export function BlockRow({
  block,
  depth,
  hasChildren,
  ordinal,
  isDragging,
  dropZone,
}: {
  block: Block;
  depth: number;
  /** Whether this block has children (drives the collapse chevron). */
  hasChildren: boolean;
  /** 1-based position within the consecutive run of same-type siblings (ordinal-marker blocks). */
  ordinal: number;
  isDragging: boolean;
  /** Where the dragged block would land relative to this row, or null. */
  dropZone: DropZone | null;
}) {
  const { focusedBlockId, makeBlockAPI } = useBlockEditor();
  const insertBelow = useInsertBlockBelow();
  const api = useMemo(() => makeBlockAPI(block.id), [makeBlockAPI, block.id]);
  const isFocused = focusedBlockId === block.id;
  const { isSelected } = useMultiSelectItem(block.id);
  const selection = useSelectionControl();

  // Show a collapse chevron when the block has children, or always for block
  // types that opt in (e.g. the toggle block). Read generically from the handle.
  const contributions = Editor.Block.useContributions();
  const handle = contributions.find((c) => c.block.type === block.type)?.block;
  const showChevron = hasChildren || handle?.collapsible === "always";
  const collapsed = !block.expanded;

  const { attributes, listeners, setNodeRef: setDragRef } = useDraggable({
    id: `drag:${block.id}`,
    data: { id: block.id },
  });
  // One droppable per row; the editor's drag handler resolves before/after/child
  // from the pointer's position within this rect (single target → single line).
  const { setNodeRef: setDropRef } = useDroppable({ id: block.id });

  // Left edge of this row's content, measured from the row's own border box.
  // The gutter rail lives in the row's padding, so every offset below is
  // relative to the row — the controls hang back into the rail, and a drop
  // lands as a sibling of this row, so the line sits at this row's depth.
  const contentLeft = BLOCK_GUTTER + depth * BLOCK_INDENT;
  const gutterLineHeight = GUTTER_LINE_HEIGHT[handle?.textVariant ?? "body"];

  return (
    <div
      ref={setDropRef}
      data-block-id={block.id}
      className="group/row relative"
      style={{ paddingLeft: contentLeft, "--gutter-line-height": gutterLineHeight } as CSSProperties}
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
          style={{ left: contentLeft - 20 }}
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
        style={{ left: contentLeft - 60 }}
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
            style={{ left: contentLeft - 40 }}
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
      {dropZone && (
        <div
          // eslint-disable-next-line layout/no-adhoc-layout -- drop indicator positioned via JS-computed left coord (style below) + right-1/top-0/bottom-0 edge pins; not a ramp-expressible anchor
          className={cn(
            "bg-primary pointer-events-none absolute right-1 z-raised h-[2px] rounded-full",
            dropZone === "before" ? "top-0" : "bottom-0",
          )}
          style={{ left: contentLeft + 4 }}
        >
          {/* eslint-disable-next-line layout/no-adhoc-layout -- decorative endpoint dot offset onto the line via fractional negative coords */}
          <div className="bg-primary absolute -left-1 -top-[3px] size-2 rounded-full" />
        </div>
      )}
    </div>
  );
}
