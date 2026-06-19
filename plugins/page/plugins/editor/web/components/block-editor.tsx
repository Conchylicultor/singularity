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
import { Overlay } from "@plugins/primitives/plugins/css/plugins/overlay/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Button, cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import {
  buildTree,
  computeDrop,
  isDescendant,
  selectionRoots,
  subtreeIds,
  type DropZone,
  type TreeNode,
} from "@plugins/primitives/plugins/tree/core";
import {
  MultiSelectProvider,
  SelectionBar,
  useMultiSelect,
} from "@plugins/primitives/plugins/multi-select/web";
import { ContentScope } from "@plugins/primitives/plugins/select-scope/web";
import { UndoRedoProvider, useUndoRedoShortcuts } from "@plugins/primitives/plugins/undo-redo/web";
import { textOf, type Block, type SerializedBlock } from "../../core";
import { BlockEditorProvider, useBlockEditor } from "../block-editor-context";
import { Editor } from "../slots";
import { serializeForest } from "../serialize-blocks";
import {
  blocksToMarkdown,
  defaultTextHandle,
  markdownToForest,
} from "../markdown-blocks";
import {
  SelectionControlProvider,
  type SelectionControl,
} from "../selection-control";
import { AddBlockMenu } from "./add-block-menu";
import { BlockRow, BLOCK_GUTTER } from "./block-row";
import { FileDropOverlay } from "./file-drop-overlay";
import {
  resolveBlockPasteHandler,
  resolvePastedBlock,
  type BlockPasteHandler,
} from "../internal/block-paste-handlers";

type FlatBlock = { block: Block; depth: number; hasChildren: boolean; ordinal: number };
type DropTarget = { id: string; zone: DropZone };

/** Custom clipboard MIME carrying a serialized block forest (round-trips full
 *  structure); `text/plain` carries a markdown fallback for external apps. */
const BLOCKS_MIME = "application/x-singularity-blocks+json";

// Depth-first flatten that carries each block's depth. Rendering the tree as a
// flat list of keyed siblings (rather than nesting children inside their parent's
// DOM) keeps every block in the same React parent, so indent/outdent/move only
// reorder keyed elements — the Lexical editor instance (and its focus) survives.
function flattenTree(nodes: TreeNode<Block>[], depth: number, out: FlatBlock[]): void {
  // `ordinal` is the 1-based position within the maximal run of consecutive
  // same-type siblings (resets on type change). Each recursive call into a
  // node's children starts a fresh counter, so numbering resets per level.
  let ordinal = 0;
  let prevType: string | null = null;
  for (const node of nodes) {
    ordinal = node.type === prevType ? ordinal + 1 : 1;
    prevType = node.type;
    out.push({ block: node, depth, hasChildren: node.children.length > 0, ordinal });
    // Skip a collapsed node's subtree so its children stay hidden. `expanded`
    // defaults true for every existing row, so current documents are unchanged.
    if (node.expanded) flattenTree(node.children, depth + 1, out);
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
  pageId,
  onOpenPage,
  contentClassName,
}: {
  pageId: string;
  /**
   * Optional navigation callback for link/mention block renderers. Decoupled
   * from any host app's pane (mirrors file-links' `onFileOpen`); the host wires
   * it when mounting `<BlockEditor>`.
   */
  onOpenPage?: (pageId: string) => void;
  /**
   * Optional class applied to the centered block-content wrapper (e.g. a
   * reading measure like `mx-auto max-w-4xl px-lg`). The pointer/marquee
   * surface always fills the full host width, so drag-selecting and
   * click-to-edit work across the whitespace beside a narrow content column;
   * only the blocks themselves are constrained by this class. Omit it (the
   * story host) to let block content fill the full width.
   */
  contentClassName?: string;
}) {
  return (
    // One independent structural-undo history per editor surface (per tab). The
    // provider sits ABOVE BlockEditorProvider because the latter calls
    // `useUndoRedo()` to record at the mutation chokepoints.
    <UndoRedoProvider>
      <BlockEditorProvider pageId={pageId} onOpenPage={onOpenPage}>
        <BlockEditorInner contentClassName={contentClassName} />
      </BlockEditorProvider>
    </UndoRedoProvider>
  );
}

function BlockEditorInner({ contentClassName }: { contentClassName?: string }) {
  // `blocks`/`pending` come from the provider's optimistic resource so `rowsRef`
  // (set by the effect below) tracks optimistic state — required for chained-op
  // intent resolution (e.g. Enter then Shift+Tab resolving against post-split).
  const { setFlatOrder, setRows, blocks, pending } = useBlockEditor();

  // Surface-level (focus-independent) undo/redo. Bindings are scoped to THIS
  // surface tab — eligible whenever this tab is focused, regardless of which DOM
  // element (a Lexical contenteditable, the selection-mode container, or even
  // <body> after a structural undo deletes the focused block) holds the caret.
  // `enableInInputs` lets them fire inside the block contenteditables; the native
  // keydown bubbles to the window-level ShortcutManager untouched (no Lexical
  // HistoryPlugin consumes Cmd+Z anymore). This replaces the old per-block /
  // container routing that broke whenever focus landed on <body>.
  useUndoRedoShortcuts();

  const { rows, flat } = useMemo(() => {
    if (pending) {
      return { rows: [] as Block[], flat: [] as FlatBlock[] };
    }
    const sorted = [...blocks].sort((a, b) => Rank.compare(a.rank, b.rank));
    const tree = buildTree(sorted);
    const out: FlatBlock[] = [];
    flattenTree(tree, 0, out);
    return { rows: sorted, flat: out };
  }, [blocks, pending]);

  useEffect(() => {
    setFlatOrder(flat.map((f) => f.block));
    setRows(rows);
  }, [flat, rows, setFlatOrder, setRows]);

  const orderedIds = useMemo(() => flat.map((f) => f.block.id), [flat]);

  if (pending) {
    return (
      <Loading variant="rows" />
    );
  }

  return (
    <MultiSelectProvider orderedIds={orderedIds}>
      <SelectionLayer rows={rows} flat={flat} contentClassName={contentClassName} />
    </MultiSelectProvider>
  );
}

function SelectionLayer({
  rows,
  flat,
  contentClassName,
}: {
  rows: Block[];
  flat: FlatBlock[];
  contentClassName?: string;
}) {
  const {
    move,
    bulkMove,
    bulkDelete,
    bulkDuplicate,
    paste,
    insert,
    focusBlock,
    focusedBlockId,
  } = useBlockEditor();
  const { selectedIds, isActive, setRange, clearAll, selectAll } =
    useMultiSelect();
  const contributions = Editor.Block.useContributions();
  const handles = useMemo(() => contributions.map((c) => c.block), [contributions]);

  // `containerRef` is the full-width interaction surface (focus target for
  // keyboard/clipboard, marquee pointer origin); `contentRef` is the centered
  // block-content wrapper the marquee overlay is positioned within.
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<string | null>(null);
  const headRef = useRef<string | null>(null);

  const orderedIds = useMemo(() => flat.map((f) => f.block.id), [flat]);

  // Keep the live selection reachable from imperative DOM event handlers
  // (clipboard) without re-subscribing them on every selection change.
  const selectedRef = useRef(selectedIds);
  selectedRef.current = selectedIds;
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  const focusContainer = useCallback(() => {
    containerRef.current?.focus();
  }, []);

  const applyRange = useCallback(
    (anchor: string, head: string) => {
      anchorRef.current = anchor;
      headRef.current = head;
      setRange(anchor, head);
    },
    [setRange],
  );

  const clearSelection = useCallback(() => {
    anchorRef.current = null;
    headRef.current = null;
    clearAll();
  }, [clearAll]);

  const neighbor = useCallback(
    (id: string, dir: "up" | "down"): string | null => {
      const idx = orderedIds.indexOf(id);
      if (idx === -1) return null;
      const next = dir === "down" ? idx + 1 : idx - 1;
      return orderedIds[next] ?? null;
    },
    [orderedIds],
  );

  const selectionControl = useMemo<SelectionControl>(
    () => ({
      enterSelectionMode(blockId, extend) {
        if (!extend) {
          applyRange(blockId, blockId);
        } else {
          const target = neighbor(blockId, extend) ?? blockId;
          applyRange(blockId, target);
        }
        focusContainer();
      },
      extendTo(blockId) {
        const anchor = anchorRef.current ?? focusedBlockId ?? blockId;
        applyRange(anchor, blockId);
        focusContainer();
      },
      selectOnly(blockId) {
        applyRange(blockId, blockId);
        focusContainer();
      },
      clear: clearSelection,
    }),
    [applyRange, neighbor, focusContainer, focusedBlockId, clearSelection],
  );

  // ---- Clipboard (DOM copy/cut/paste on the focused container) -------------

  const writeClipboard = useCallback(
    (e: React.ClipboardEvent) => {
      const roots = selectionRoots(rowsRef.current, selectedRef.current);
      if (roots.length === 0) return false;
      const forest = serializeForest(rowsRef.current, roots);
      e.clipboardData.setData(BLOCKS_MIME, JSON.stringify(forest));
      e.clipboardData.setData("text/plain", blocksToMarkdown(forest, handles));
      e.preventDefault();
      return true;
    },
    [handles],
  );

  const onCopy = useCallback(
    (e: React.ClipboardEvent) => {
      if (document.activeElement !== containerRef.current) return;
      writeClipboard(e);
    },
    [writeClipboard],
  );

  const onCut = useCallback(
    (e: React.ClipboardEvent) => {
      if (document.activeElement !== containerRef.current) return;
      if (writeClipboard(e)) {
        bulkDelete([...selectedRef.current]);
        clearSelection();
      }
    },
    [writeClipboard, bulkDelete, clearSelection],
  );

  const onPaste = useCallback(
    (e: React.ClipboardEvent) => {
      if (document.activeElement !== containerRef.current) return;
      // A pasted file (image/video/audio/…) becomes an attachment block, inserted
      // after the current selection — resolved through the generic registry so
      // this consumer never names a specific block type.
      const picked = resolvePastedBlock(e.clipboardData);
      if (picked) {
        e.preventDefault();
        const { file, handler } = picked;
        const roots = selectionRoots(rowsRef.current, selectedRef.current);
        const afterId =
          headRef.current ?? focusedBlockId ?? roots[roots.length - 1] ?? null;
        void (async () => {
          const data = await handler.build(file);
          await paste({
            blocks: [{ type: handler.type, data, expanded: false, children: [] }],
            afterId,
          });
        })();
        return;
      }
      const json = e.clipboardData.getData(BLOCKS_MIME);
      let forest: SerializedBlock[];
      if (json) {
        try {
          forest = JSON.parse(json) as SerializedBlock[];
        } catch (err) {
          if (!(err instanceof SyntaxError)) throw err;
          return;
        }
      } else {
        const text = e.clipboardData.getData("text/plain");
        if (!text.trim()) return;
        forest = markdownToForest(text, handles);
      }
      if (!Array.isArray(forest) || forest.length === 0) return;
      e.preventDefault();
      const roots = selectionRoots(rowsRef.current, selectedRef.current);
      const afterId =
        headRef.current ?? focusedBlockId ?? roots[roots.length - 1] ?? null;
      void paste({ blocks: forest, afterId });
    },
    [handles, paste, focusedBlockId],
  );

  // Nudge the whole selection up/down by one slot among its siblings.
  const moveSelection = useCallback(
    (dir: "up" | "down") => {
      const roots = selectionRoots(rowsRef.current, selectedRef.current);
      if (roots.length === 0) return;
      const moving = new Set(roots.flatMap((r) => subtreeIds(rowsRef.current, r)));
      // Operate within the first root's sibling list (the common case: a
      // contiguous run of same-parent blocks).
      const first = rowsRef.current.find((r) => r.id === roots[0]);
      if (!first) return;
      const siblings = rowsRef.current
        .filter((r) => r.parentId === first.parentId)
        .sort((a, b) => Rank.compare(a.rank, b.rank));
      const rootSet = new Set(roots);
      const idxs = siblings
        .map((s, i) => (rootSet.has(s.id) ? i : -1))
        .filter((i) => i >= 0);
      if (idxs.length === 0) return;
      const top = Math.min(...idxs);
      const bottom = Math.max(...idxs);
      const remaining = siblings.filter((s) => !moving.has(s.id));
      let afterId: string | null;
      if (dir === "up") {
        // Place before the sibling currently above the run.
        const above = siblings[top - 1];
        if (!above) return;
        const aboveIdxInRemaining = remaining.findIndex((s) => s.id === above.id);
        afterId = remaining[aboveIdxInRemaining - 1]?.id ?? null;
      } else {
        const below = siblings[bottom + 1];
        if (!below) return;
        afterId = below.id;
      }
      bulkMove({ ids: roots, parentId: first.parentId, afterId });
    },
    [bulkMove],
  );

  // ---- Keyboard (block-selection mode; container must be the focus) --------

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (document.activeElement !== containerRef.current) return;
      if (!isActive) return;
      const mod = e.metaKey || e.ctrlKey;

      // Undo/redo (Cmd+Z / Cmd+Shift+Z / Cmd+Y) is NOT handled here — it routes
      // through the surface-level `useUndoRedoShortcuts` binding (focus-independent,
      // scoped to this tab), so it works the same whether a block editor, this
      // selection container, or <body> holds focus.

      if (e.key === "Escape") {
        e.preventDefault();
        clearSelection();
        return;
      }
      if (mod && e.key.toLowerCase() === "a") {
        e.preventDefault();
        selectAll();
        anchorRef.current = orderedIds[0] ?? null;
        headRef.current = orderedIds[orderedIds.length - 1] ?? null;
        return;
      }
      if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        void bulkDuplicate([...selectedRef.current]);
        return;
      }
      if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        bulkDelete([...selectedRef.current]);
        clearSelection();
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const head = headRef.current;
        clearSelection();
        if (head) focusBlock(head);
        return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        const dir = e.key === "ArrowDown" ? "down" : "up";
        const head = headRef.current ?? anchorRef.current;
        if (!head) return;
        const next = neighbor(head, dir);
        if (!next) {
          e.preventDefault();
          return;
        }
        e.preventDefault();
        if (e.altKey && e.shiftKey) {
          moveSelection(dir);
        } else if (e.shiftKey) {
          applyRange(anchorRef.current ?? head, next);
        } else {
          applyRange(next, next);
        }
      }
    },
    [
      isActive,
      clearSelection,
      selectAll,
      orderedIds,
      bulkDuplicate,
      bulkDelete,
      focusBlock,
      neighbor,
      applyRange,
      moveSelection,
    ],
  );

  // ---- Marquee drag-select on the empty container background ---------------

  const [marquee, setMarquee] = useState<{ top: number; height: number } | null>(
    null,
  );
  const marqueeStartRef = useRef<{ id: string | null; y: number } | null>(null);
  const marqueeMovedRef = useRef(false);

  // Notion-style click-to-edit on the empty editor background: a plain click
  // (no drag) routes the caret to a block instead of doing nothing. Above the
  // first block focuses it; the trailing zone below the last block focuses it
  // when it's an empty default-text block, otherwise appends a fresh paragraph;
  // an empty page gets its first block. A click in a gap *between* blocks keeps
  // the original behavior of clearing any selection.
  const onEmptyClick = useCallback(
    (y: number) => {
      const fallback = defaultTextHandle(handles);
      const firstId = flat[0]?.block.id;
      const lastBlock = flat[flat.length - 1]?.block;
      const els = document.querySelectorAll<HTMLElement>("[data-block-id]");
      const firstEl = els[0];
      const lastEl = els[els.length - 1];

      if (!firstEl || !lastEl || !firstId || !lastBlock) {
        if (fallback) insert(fallback.type, fallback.empty?.() ?? {});
        return;
      }
      if (y < firstEl.getBoundingClientRect().top) {
        focusBlock(firstId);
        return;
      }
      if (y > lastEl.getBoundingClientRect().bottom) {
        if (fallback && lastBlock.type === fallback.type && textOf(lastBlock) === "") {
          focusBlock(lastBlock.id);
        } else if (fallback) {
          insert(fallback.type, fallback.empty?.() ?? {});
        }
        return;
      }
      clearSelection();
    },
    [flat, handles, focusBlock, insert, clearSelection],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      const el = e.target as HTMLElement;
      // Only start on empty background — never over a block, gutter button, or
      // editable text (those have their own pointer behavior).
      if (
        el.closest("[data-block-id]") ||
        el.closest("button") ||
        el.closest('[contenteditable="true"]')
      ) {
        return;
      }
      const start = rowAtPointer(e.clientY);
      marqueeStartRef.current = { id: start?.id ?? null, y: e.clientY };
      marqueeMovedRef.current = false;
      focusContainer();

      const onMove = (ev: PointerEvent) => {
        const startInfo = marqueeStartRef.current;
        if (!startInfo) return;
        const cur = rowAtPointer(ev.clientY);
        const content = contentRef.current;
        if (content) {
          const r = content.getBoundingClientRect();
          const top = Math.min(startInfo.y, ev.clientY) - r.top;
          const height = Math.abs(ev.clientY - startInfo.y);
          if (height > 3) {
            marqueeMovedRef.current = true;
            setMarquee({ top, height });
          }
        }
        if (cur && startInfo.id) applyRange(startInfo.id, cur.id);
      };
      const onUp = () => {
        // A plain click (no drag) on the empty background routes the caret to a
        // block; a drag was a marquee selection and is left alone.
        if (!marqueeMovedRef.current) {
          const startY = marqueeStartRef.current?.y;
          if (startY != null) onEmptyClick(startY);
        }
        marqueeStartRef.current = null;
        setMarquee(null);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [applyRange, focusContainer, onEmptyClick],
  );

  // ---- Drag-and-drop (single block, or the whole selection) ----------------

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  // External (OS) file-drag state, kept separate from the dnd-kit block-reorder
  // drag above: native HTML drag events never overlap dnd-kit's pointer-based
  // reorder, so the two can't be active at once.
  const [fileDropTarget, setFileDropTarget] = useState<DropTarget | null>(null);
  const [fileDragging, setFileDragging] = useState(false);
  // Resolved selection roots + their subtree when dragging a multi-selection.
  const bulkDragRef = useRef<{ roots: string[]; subtree: Set<string> } | null>(
    null,
  );

  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const collisionDetection = useCallback<CollisionDetection>((args) => {
    if (args.pointerCoordinates) pointerRef.current = args.pointerCoordinates;
    return pointerWithin(args);
  }, []);

  const currentTarget = (): DropTarget | null => {
    const pointer = pointerRef.current;
    if (!pointer || !activeId) return null;
    const target = rowAtPointer(pointer.y);
    if (!target) return null;
    const bulk = bulkDragRef.current;
    if (bulk) {
      if (bulk.subtree.has(target.id)) return null;
    } else {
      if (target.id === activeId) return null;
      if (isDescendant(rows, activeId, target.id)) return null;
    }
    return target;
  };

  const onDragStart = (event: DragStartEvent) => {
    const id = (event.active.data.current?.id as string | undefined) ?? null;
    setActiveId(id);
    if (id && selectedIds.has(id)) {
      const roots = selectionRoots(rows, selectedIds);
      const subtree = new Set(roots.flatMap((r) => subtreeIds(rows, r)));
      bulkDragRef.current = { roots, subtree };
    } else {
      bulkDragRef.current = null;
    }
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
    const bulk = bulkDragRef.current;
    setDropTarget(null);
    setActiveId(null);
    bulkDragRef.current = null;
    if (!dragged || !target) return;

    if (bulk) {
      const targetRow = rows.find((r) => r.id === target.id);
      if (!targetRow) return;
      const parentId = targetRow.parentId;
      let afterId: string | null;
      if (target.zone === "after") {
        afterId = target.id;
      } else {
        const siblings = rows
          .filter((r) => r.parentId === parentId && !bulk.subtree.has(r.id))
          .sort((a, b) => Rank.compare(a.rank, b.rank));
        const idx = siblings.findIndex((s) => s.id === target.id);
        afterId = siblings[idx - 1]?.id ?? null;
      }
      bulkMove({ ids: bulk.roots, parentId, afterId });
      return;
    }

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
    bulkDragRef.current = null;
  };

  // ---- External file drop (OS drag-and-drop → attachment block) ------------

  // Resolve where a forest dropped over `target` should land. "after" lands as a
  // sibling right below the target; "before" anchors after the target's previous
  // sibling (same parent), or at the parent's start when it's the first child —
  // mirroring the bulk-reorder before/after computation. A null target (empty
  // page / no rows) lands at the page's top level.
  const fileDropPosition = useCallback(
    (target: DropTarget | null): { afterId: string | null; parentId: string | null } => {
      if (!target) return { afterId: null, parentId: null };
      const targetRow = rowsRef.current.find((r) => r.id === target.id);
      if (!targetRow) return { afterId: null, parentId: null };
      if (target.zone === "after") {
        return { afterId: target.id, parentId: targetRow.parentId };
      }
      const siblings = rowsRef.current
        .filter((r) => r.parentId === targetRow.parentId)
        .sort((a, b) => Rank.compare(a.rank, b.rank));
      const idx = siblings.findIndex((s) => s.id === target.id);
      return { afterId: siblings[idx - 1]?.id ?? null, parentId: targetRow.parentId };
    },
    [],
  );

  const onFileDragOver = useCallback((e: React.DragEvent) => {
    // Only react to an OS file drag — internal text/element drags carry no Files.
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault(); // required so the drop event fires
    e.dataTransfer.dropEffect = "copy";
    setFileDragging(true);
    const next = rowAtPointer(e.clientY);
    setFileDropTarget((prev) =>
      prev?.id === next?.id && prev?.zone === next?.zone ? prev : next,
    );
  }, []);

  const onFileDragLeave = useCallback((e: React.DragEvent) => {
    // dragleave fires when crossing into a child too; only clear when the pointer
    // has actually left the container's subtree.
    if (containerRef.current?.contains(e.relatedTarget as Node | null)) return;
    setFileDragging(false);
    setFileDropTarget(null);
  }, []);

  const onFileDrop = useCallback(
    (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes("Files")) return;
      e.preventDefault();
      // Read the FileList + pointer position synchronously — both are cleared once
      // this handler returns, before the async uploads below run.
      const picks = Array.from(e.dataTransfer.files)
        .map((file) => ({ file, handler: resolveBlockPasteHandler(file.type) }))
        .filter((p): p is { file: File; handler: BlockPasteHandler } => p.handler !== null);
      const pos = fileDropPosition(rowAtPointer(e.clientY));
      setFileDragging(false);
      setFileDropTarget(null);
      if (picks.length === 0) return;
      // Each file becomes its matching attachment block via the generic registry,
      // so image/video/audio/file participate with no per-type code here.
      void (async () => {
        const blocks = await Promise.all(
          picks.map(async ({ file, handler }) => ({
            type: handler.type,
            data: await handler.build(file),
            expanded: false,
            children: [],
          })),
        );
        await paste({ blocks, ...pos });
      })();
    },
    [fileDropPosition, paste],
  );

  // The reorder drag and the file drag are mutually exclusive, so one indicator
  // source feeds the per-row insertion line.
  const activeDropTarget = dropTarget ?? fileDropTarget;

  const selectedCount = selectedIds.size;

  return (
    <SelectionControlProvider value={selectionControl}>
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={onDragStart}
        onDragMove={onDragMove}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
      >
        <SelectionBar
          actions={
            <>
              <button
                type="button"
                className="text-foreground hover:text-foreground/80"
                onClick={() => {
                  containerRef.current?.focus();
                  document.execCommand("copy");
                }}
              >
                Copy
              </button>
              <Button
                variant="ghost"
                size="sm"
                className="text-foreground hover:text-foreground/80"
                onClick={() => bulkDuplicate([...selectedIds])}
              >
                Duplicate
              </Button>
              <button
                type="button"
                className="text-destructive hover:text-destructive/80"
                onClick={() => {
                  bulkDelete([...selectedIds]);
                  clearSelection();
                }}
              >
                Delete
              </button>
            </>
          }
        />
        <ContentScope>
          {/* The interaction surface fills the full host width so a marquee
              drag (and click-to-edit) can start from the whitespace beside a
              narrow, centered content column — not just over the text measure.
              It owns focus, keyboard, clipboard, and the pointer origin; the
              centered content wrapper below only constrains where the blocks
              render. min-h gives an empty area below the content to start a
              marquee from. */}
          <Overlay
            as="div"
            ref={containerRef}
            tabIndex={-1}
            role="listbox"
            aria-multiselectable
            aria-label="Page blocks"
            onKeyDown={onKeyDown}
            onCopy={onCopy}
            onCut={onCut}
            onPaste={onPaste}
            onPointerDown={onPointerDown}
            onDragOver={onFileDragOver}
            onDragLeave={onFileDragLeave}
            onDrop={onFileDrop}
            onFocusCapture={(e) => {
              // Focusing into a block's editor (clicking to type) drops any block
              // selection. Focusing the container itself (selection mode) doesn't.
              if (e.target !== containerRef.current && isActive) clearSelection();
            }}
            // Full-surface file-drop scrim painted above the blocks (a
            // pointer-events-none `above` layer, so it never eats the drag
            // events). The per-row insertion line below still pinpoints the drop.
            above={<FileDropOverlay active={fileDragging} />}
            className="min-h-40 w-full cursor-text pb-sm pt-md outline-none"
          >
            {/* Symmetric BLOCK_GUTTER reserves the left rail the three hover
                controls (chevron, drag handle, +) hang into at -20/-40/-60 from
                the content edge, and a matching right gutter so the text measure
                stays centered. Block content aligns with the page title, which
                reserves the same left rail for its icon. */}
            <div
              ref={contentRef}
              className={cn("relative", contentClassName)}
              style={{ paddingLeft: BLOCK_GUTTER, paddingRight: BLOCK_GUTTER }}
            >
              {flat.map((f) => (
                <BlockRow
                  key={f.block.id}
                  block={f.block}
                  depth={f.depth}
                  hasChildren={f.hasChildren}
                  ordinal={f.ordinal}
                  isDragging={
                    activeId === f.block.id ||
                    (bulkDragRef.current?.subtree.has(f.block.id) ?? false)
                  }
                  dropZone={
                    activeDropTarget?.id === f.block.id ? activeDropTarget.zone : null
                  }
                />
              ))}
              {/* eslint-disable-next-line spacing/no-adhoc-spacing -- mt-1 offsets the Add-block affordance below the block list; the container isn't a flex Stack (it holds keyed rows + an absolute marquee), so the margin can't lift into a parent gap */}
              <div className="mt-1">
                <AddBlockMenu />
              </div>
              {marquee && (
                <div
                  // eslint-disable-next-line layout/no-adhoc-layout -- marquee rectangle positioned via JS-computed top/height coords (inset-x-2 insets its sides within the content box); not a ramp-expressible anchor
                  className="bg-primary/10 border-primary/40 pointer-events-none absolute inset-x-2 z-base rounded-md border"
                  style={{ top: marquee.top, height: marquee.height }}
                />
              )}
            </div>
          </Overlay>
        </ContentScope>
        <DragOverlay dropAnimation={null}>
          {activeId ? (
            <Stack
              direction="row"
              align="center"
              gap="xs"
              className="bg-background/90 border-accent text-muted-foreground rounded-md border px-sm py-xs shadow"
            >
              <MdDragIndicator className="size-4" />
              {bulkDragRef.current && selectedCount > 1 ? (
                <Text variant="body">{`${selectedCount} blocks`}</Text>
              ) : null}
            </Stack>
          ) : null}
        </DragOverlay>
      </DndContext>
    </SelectionControlProvider>
  );
}
