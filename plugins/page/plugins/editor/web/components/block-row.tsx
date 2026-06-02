import { useMemo } from "react";
import { MdDragIndicator } from "react-icons/md";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import type { DropZone } from "@plugins/primitives/plugins/tree/core";
import { cn } from "@/lib/utils";
import type { Block } from "../../core";
import { useBlockEditor } from "../block-editor-context";
import { Editor } from "../slots";

export const INDENT = 24;

export function BlockRow({
  block,
  depth,
  isDragging,
  dropZone,
}: {
  block: Block;
  depth: number;
  isDragging: boolean;
  /** Where the dragged block would land relative to this row, or null. */
  dropZone: DropZone | null;
}) {
  const { focusedBlockId, makeBlockAPI } = useBlockEditor();
  const api = useMemo(() => makeBlockAPI(block.id), [makeBlockAPI, block.id]);
  const isFocused = focusedBlockId === block.id;

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
      <button
        type="button"
        ref={setDragRef}
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
        className={cn(
          "absolute top-1 z-10 flex size-5 items-center justify-center rounded",
          "text-muted-foreground hover:bg-accent cursor-grab active:cursor-grabbing",
          "opacity-0 group-hover/row:opacity-60",
        )}
        style={{ left: depth * INDENT - 20 }}
      >
        <MdDragIndicator className="size-4" />
      </button>
      <div className={cn("rounded", isDragging && "opacity-40")}>
        <Editor.Block.Dispatch block={block} isFocused={isFocused} editor={api} />
      </div>
      {dropZone && (
        <div
          className={cn(
            "bg-primary pointer-events-none absolute right-1 z-10 h-[2px] rounded-full",
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
