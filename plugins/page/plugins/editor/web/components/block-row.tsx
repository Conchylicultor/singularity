import { cn } from "@plugins/primitives/plugins/ui-kit/web";
import { useMemo } from "react";
import { MdAdd, MdChevronRight, MdDragIndicator } from "react-icons/md";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import type { DropZone } from "@plugins/primitives/plugins/tree/core";
import { useMultiSelectItem } from "@plugins/primitives/plugins/multi-select/web";
import type { Block } from "../../core";
import { useBlockEditor } from "../block-editor-context";
import { useSelectionControl } from "../selection-control";
import { Editor } from "../slots";
import { BlockTypeMenu } from "./block-type-menu";
import { BlockActionsMenu } from "./block-actions-menu";

export const INDENT = 24;

export function BlockRow({
  block,
  depth,
  hasChildren,
  isDragging,
  dropZone,
}: {
  block: Block;
  depth: number;
  /** Whether this block has children (drives the collapse chevron). */
  hasChildren: boolean;
  isDragging: boolean;
  /** Where the dragged block would land relative to this row, or null. */
  dropZone: DropZone | null;
}) {
  const { focusedBlockId, makeBlockAPI } = useBlockEditor();
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

  // A drop lands as a sibling of this row, so the line sits at this row's depth.
  const lineIndent = depth * INDENT;

  return (
    <div
      ref={setDropRef}
      data-block-id={block.id}
      className="group/row relative"
      style={{ paddingLeft: depth * INDENT }}
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
          className={cn(
            "absolute top-1 z-raised flex size-5 items-center justify-center rounded-md",
            "text-muted-foreground hover:bg-accent cursor-pointer",
            collapsed ? "opacity-60" : "opacity-0 group-hover/row:opacity-60",
          )}
          style={{ left: depth * INDENT - 20 }}
        >
          <MdChevronRight className={cn("size-4 transition-transform", !collapsed && "rotate-90")} />
        </button>
      )}
      {/* Gutter "+" — inserts a new block immediately below this one. */}
      <BlockTypeMenu
        align="start"
        side="bottom"
        onSelect={(b) => api.insertAfter(b.type, b.empty?.() ?? {})}
        trigger={
          <button
            type="button"
            aria-label="Insert block below"
            className={cn(
              "absolute top-1 z-raised flex size-5 items-center justify-center rounded-md",
              "text-muted-foreground hover:bg-accent cursor-pointer",
              "opacity-0 group-hover/row:opacity-60",
            )}
            style={{ left: depth * INDENT - 60 }}
          >
            <MdAdd className="size-4" />
          </button>
        }
      />
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
            className={cn(
              "absolute top-1 z-raised flex size-5 items-center justify-center rounded-md",
              "text-muted-foreground hover:bg-accent cursor-grab active:cursor-grabbing",
              "opacity-0 group-hover/row:opacity-60",
            )}
            style={{ left: depth * INDENT - 40 }}
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
        <Editor.Block.Dispatch block={block} isFocused={isFocused} editor={api} />
      </div>
      {dropZone && (
        <div
          className={cn(
            "bg-primary pointer-events-none absolute right-1 z-raised h-[2px] rounded-full",
            dropZone === "before" ? "top-0" : "bottom-0",
          )}
          style={{ left: lineIndent + 4 }}
        >
          <div className="bg-primary absolute -left-1 -top-[3px] size-2 rounded-full" />
        </div>
      )}
    </div>
  );
}
