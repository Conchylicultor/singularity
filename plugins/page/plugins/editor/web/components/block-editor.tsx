import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MdDragIndicator } from "react-icons/md";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import {
  buildTree,
  computeDrop,
  isDescendant,
  type DropZone,
  type TreeNode,
} from "@plugins/primitives/plugins/tree/core";
import { blocksResource, type Block } from "../../core";
import { BlockEditorProvider, useBlockEditor } from "../block-editor-context";
import { AddBlockMenu } from "./add-block-menu";
import { BlockRow } from "./block-row";

type FlatBlock = { block: Block; depth: number };
type DropTarget = { id: string; zone: DropZone };

// Depth-first flatten that carries each block's depth. Rendering the tree as a
// flat list of keyed siblings (rather than nesting children inside their parent's
// DOM) keeps every block in the same React parent, so indent/outdent/move only
// reorder keyed elements — the Lexical editor instance (and its focus) survives.
function flattenTree(nodes: TreeNode<Block>[], depth: number, out: FlatBlock[]): void {
  for (const node of nodes) {
    out.push({ block: node, depth });
    flattenTree(node.children, depth + 1, out);
  }
}

// Find the rendered block row under a vertical pointer position, plus whether the
// pointer sits in its top (before) or bottom (after) half. Reads live DOM rects
// rather than dnd-kit's cached droppable rects, which drift off-by-one as block
// heights settle. Falls back to the nearest row when between/outside rows.
function rowAtPointer(y: number): { id: string; zone: DropZone } | null {
  const els = document.querySelectorAll<HTMLElement>("[data-block-id]");
  let nearest: { id: string; zone: DropZone } | null = null;
  let nearestDist = Infinity;
  for (const el of els) {
    const id = el.dataset.blockId;
    if (!id) continue;
    const r = el.getBoundingClientRect();
    const zone: DropZone = y < r.top + r.height / 2 ? "before" : "after";
    if (y >= r.top && y <= r.bottom) return { id, zone };
    const dist = y < r.top ? r.top - y : y - r.bottom;
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = { id, zone };
    }
  }
  return nearest;
}

export function BlockEditor({
  documentId,
  onOpenPage,
}: {
  documentId: string;
  /**
   * Optional navigation callback for link/mention block renderers. Decoupled
   * from any host app's pane (mirrors file-links' `onFileOpen`); the host wires
   * it when mounting `<BlockEditor>`.
   */
  onOpenPage?: (pageId: string) => void;
}) {
  return (
    <BlockEditorProvider documentId={documentId} onOpenPage={onOpenPage}>
      <BlockEditorInner documentId={documentId} />
    </BlockEditorProvider>
  );
}

function BlockEditorInner({ documentId }: { documentId: string }) {
  const result = useResource(blocksResource, { documentId });
  const { setFlatOrder, move } = useBlockEditor();

  const { rows, flat } = useMemo(() => {
    if (result.pending) {
      return { rows: [] as Block[], flat: [] as FlatBlock[] };
    }
    const sorted = [...result.data].sort((a, b) => Rank.compare(a.rank, b.rank));
    const tree = buildTree(sorted);
    const out: FlatBlock[] = [];
    flattenTree(tree, 0, out);
    return { rows: sorted, flat: out };
  }, [result]);

  useEffect(() => {
    setFlatOrder(flat.map((f) => f.block));
  }, [flat, setFlatOrder]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);

  // Capture the live pointer position; collision detection runs on every drag
  // frame. We only use the pointer (not dnd-kit's `over`) and resolve the row
  // ourselves from live DOM rects via rowAtPointer.
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const collisionDetection = useCallback<CollisionDetection>((args) => {
    if (args.pointerCoordinates) pointerRef.current = args.pointerCoordinates;
    return pointerWithin(args);
  }, []);

  // Resolve where a drop would land from the pointer's vertical position: top
  // half of a row → before, bottom half → after. A drop lands as a sibling of
  // the target (inheriting its depth); deeper nesting is done by dropping next
  // to an already-nested block, or with Tab/indent. One target at a time →
  // exactly one insertion line, with no before/after duplication.
  const currentTarget = (): DropTarget | null => {
    const pointer = pointerRef.current;
    if (!pointer || !activeId) return null;
    const target = rowAtPointer(pointer.y);
    if (!target || target.id === activeId) return null;
    if (isDescendant(rows, activeId, target.id)) return null;
    return target;
  };

  const onDragStart = (event: DragStartEvent) => {
    setActiveId((event.active.data.current?.id as string | undefined) ?? null);
  };

  const onDragMove = () => {
    const next = currentTarget();
    setDropTarget((prev) =>
      prev?.id === next?.id && prev?.zone === next?.zone ? prev : next,
    );
  };

  const onDragEnd = () => {
    const target = currentTarget();
    const dragged = activeId;
    setDropTarget(null);
    setActiveId(null);
    if (!dragged || !target) return;
    const dest = computeDrop(rows, dragged, target.zone, target.id);
    if (!dest) return;
    const current = rows.find((r) => r.id === dragged);
    if (
      current &&
      current.parentId === dest.parentId &&
      Rank.equals(current.rank, dest.rank)
    ) {
      return;
    }
    move(dragged, dest);
  };

  const onDragCancel = () => {
    setDropTarget(null);
    setActiveId(null);
  };

  if (result.pending) {
    return <div className="px-3 py-2 text-sm text-muted-foreground">Loading...</div>;
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      <div className="py-2 pl-6 pr-2">
        {flat.map((f) => (
          <BlockRow
            key={f.block.id}
            block={f.block}
            depth={f.depth}
            isDragging={activeId === f.block.id}
            dropZone={dropTarget?.id === f.block.id ? dropTarget.zone : null}
          />
        ))}
        <div className="mt-1">
          <AddBlockMenu />
        </div>
      </div>
      <DragOverlay dropAnimation={null}>
        {activeId ? (
          <div className="bg-background/90 border-accent text-muted-foreground flex items-center gap-1 rounded border px-2 py-1 text-sm shadow">
            <MdDragIndicator className="size-4" />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
