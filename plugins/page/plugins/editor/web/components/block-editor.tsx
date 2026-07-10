import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type Ref,
} from "react";
import {
  MdDragIndicator,
  MdFormatIndentDecrease,
  MdFormatIndentIncrease,
} from "react-icons/md";
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
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { ContentScope } from "@plugins/primitives/plugins/select-scope/web";
import { useLatestRef } from "@plugins/primitives/plugins/latest-ref/web";
import { UndoRedoProvider, useUndoRedoShortcuts } from "@plugins/primitives/plugins/undo-redo/web";
import { canIndent, canOutdent, textOf, type Block, type SerializedBlock } from "../../core";
import { toNodes } from "../internal/optimistic-block-ops";
import type { CaretSurface, CaretSurfaceRef } from "../caret-surface";
import { BlockEditorProvider, useBlockEditor } from "../block-editor-context";
import { Editor } from "../slots";
import { serializeForest } from "../serialize-blocks";
import {
  blocksToMarkdown,
  defaultTextHandle,
  markdownToForest,
} from "../markdown-blocks";
import { SelectionControlProvider } from "../selection-control";
import { useBlockSelection, type BlockSelectionActions } from "../internal/use-block-selection";
import { AddBlockMenu } from "./add-block-menu";
import { BlockRow } from "./block-row";
import { BLOCK_GUTTER } from "../internal/page-column";
import { FileDropOverlay } from "./file-drop-overlay";
import {
  resolveBlockPasteHandler,
  resolvePastedBlock,
  type BlockPasteHandler,
} from "../internal/block-paste-handlers";

type FlatBlock = { block: Block; depth: number; hasChildren: boolean; ordinal: number };
/** The editor drops *between* rows only — it has no tree `child` reparent zone. */
type SiblingZone = Extract<DropZone, "before" | "after">;
type DropTarget = { id: string; zone: SiblingZone };

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
function rowAtPointer(y: number): DropTarget | null {
  const els = document.querySelectorAll<HTMLElement>("[data-block-id]");
  let nearest: DropTarget | null = null;
  let nearestDist = Infinity;
  for (const el of els) {
    const id = el.dataset.blockId;
    if (!id) continue;
    const r = el.getBoundingClientRect();
    const zone: SiblingZone = y < r.top + r.height / 2 ? "before" : "after";
    if (y >= r.top && y <= r.bottom) return { id, zone };
    const dist = y < r.top ? r.top - y : y - r.bottom;
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = { id, zone };
    }
  }
  return nearest;
}

/**
 * The block list seen from OUTSIDE the provider — by a host that renders chrome
 * next to it (the page title sits above `<BlockEditor>`, not inside it).
 *
 * It is itself a `CaretSurface`: `focusBoundary("start")` lands the caret at the
 * top of the page body, `("end")` at its bottom. That is the mirror image of the
 * `caretBefore` / `caretAfter` props — the caret crosses the editor's boundary in
 * both directions through the one contract. `insertFirstBlock` is the only member
 * beyond it, because creating a block is not a caret move.
 */
export interface BlockEditorHandle extends CaretSurface {
  /**
   * Open the top of the page for typing: focus the first block when it is
   * already an empty text block, otherwise insert a fresh one before it. Drives
   * the page title's Enter key.
   */
  insertFirstBlock(): void;
}

export function BlockEditor({
  pageId,
  onOpenPage,
  contentClassName,
  caretBefore,
  caretAfter,
  ref,
}: {
  pageId: string;
  ref?: Ref<BlockEditorHandle>;
  /**
   * Caret surfaces the host renders immediately before / after the block list
   * (the page title above it). Caret navigation that leaves the first block
   * backwards — ArrowUp, ArrowLeft at its start, Backspace at its start — or the
   * last block forwards lands there instead of stopping at the editor's edge.
   * Omit them (the story host) and those keystrokes simply do nothing.
   */
  caretBefore?: CaretSurfaceRef;
  caretAfter?: CaretSurfaceRef;
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
      <BlockEditorProvider
        pageId={pageId}
        onOpenPage={onOpenPage}
        caretBefore={caretBefore}
        caretAfter={caretAfter}
      >
        <BlockEditorInner contentClassName={contentClassName} handleRef={ref} />
      </BlockEditorProvider>
    </UndoRedoProvider>
  );
}

function BlockEditorInner({
  contentClassName,
  handleRef,
}: {
  contentClassName?: string;
  handleRef?: Ref<BlockEditorHandle>;
}) {
  // `blocks`/`pending` come from the provider's optimistic resource so `rowsRef`
  // (set by the effect below) tracks optimistic state — required for chained-op
  // intent resolution (e.g. Enter then Shift+Tab resolving against post-split).
  const { setFlatOrder, setRows, blocks, pending, insertFirst, focusBlock, focusBlockBoundary } =
    useBlockEditor();

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

  // The one imperative seam for hosts rendering above the editor (the page
  // title): the block list AS a caret surface, plus the create affordance that
  // isn't one. `insertFirstBlock` reuses `onEmptyClick`'s rule for the trailing
  // block, mirrored to the leading one: never stack a second blank paragraph on
  // top of an existing one.
  const contributions = Editor.Block.useContributions();
  useImperativeHandle(
    handleRef,
    () => ({
      insertFirstBlock() {
        const fallback = defaultTextHandle(contributions.map((c) => c.block));
        if (!fallback) return;
        const first = flat[0]?.block;
        if (first && first.type === fallback.type && textOf(first) === "") {
          focusBlock(first.id);
          return;
        }
        insertFirst(fallback.type, fallback.empty?.() ?? {});
      },
      focus() {
        const first = flat[0]?.block;
        if (first) focusBlock(first.id);
      },
      focusBoundary(edge) {
        const target = edge === "start" ? flat[0]?.block : flat.at(-1)?.block;
        if (target) focusBlockBoundary(target.id, edge);
      },
      // No `focusAtColumn`: an empty page has no block to measure a column
      // against, and a host entering from above wants the body's start anyway.
    }),
    [contributions, flat, focusBlock, focusBlockBoundary, insertFirst],
  );

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
    indentBlocks,
    outdentBlocks,
    bulkMove,
    bulkDelete,
    bulkDuplicate,
    paste,
    insert,
    focusBlock,
    focusBlockBoundary,
    focusedBlockId,
  } = useBlockEditor();
  const { selectedIds } = useMultiSelect();
  const contributions = Editor.Block.useContributions();
  const handles = useMemo(() => contributions.map((c) => c.block), [contributions]);

  // The minimal subtree roots of the selection: bulk structural ops act on these,
  // descendants follow implicitly. Recomputed on every selection/row change so the
  // selection bar's affordances reflect what the reducer would actually do.
  const roots = useMemo(
    () => selectionRoots(rows, selectedIds),
    [rows, selectedIds],
  );
  const indentable = useMemo(() => canIndent(toNodes(rows), roots), [rows, roots]);
  const outdentable = useMemo(() => canOutdent(toNodes(rows), roots), [rows, roots]);

  // `contentRef` is the centered block-content wrapper the marquee overlay is
  // positioned within. The full-width interaction surface it sits inside — the
  // focus target for keyboard/clipboard and the marquee's pointer origin — is
  // owned by `useBlockSelection` below, as `containerRef`.
  const contentRef = useRef<HTMLDivElement>(null);

  const orderedIds = useMemo(() => flat.map((f) => f.block.id), [flat]);

  // Keep the live selection reachable from imperative DOM event handlers
  // (clipboard) without re-subscribing them on every selection change.
  const selectedRef = useLatestRef(selectedIds);
  const rowsRef = useLatestRef(rows);

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
    [bulkMove, rowsRef, selectedRef],
  );

  // ---- Block-selection mode (range state, container focus + keyboard) -------

  const selectionActions = useMemo<BlockSelectionActions>(
    () => ({
      indent: indentBlocks,
      outdent: outdentBlocks,
      remove: bulkDelete,
      // `bulkDuplicate` resolves with the new ids; selection mode has no use for
      // them, so the fire-and-forget stays explicit here rather than being erased
      // by the action's `void` return type.
      duplicate: (ids) => void bulkDuplicate(ids),
      focusBlock,
      moveSelection,
    }),
    [indentBlocks, outdentBlocks, bulkDelete, bulkDuplicate, focusBlock, moveSelection],
  );

  const {
    containerRef,
    control: selectionControl,
    headRef,
    applyRange,
    clearSelection,
    focusContainer,
    onKeyDown,
    onFocusCapture,
  } = useBlockSelection({
    orderedIds,
    roots,
    focusedBlockId,
    actions: selectionActions,
  });

  // ---- Clipboard (DOM copy/cut/paste on the focused container) -------------
  //
  // These DO ask `document.activeElement`, unlike the keyboard handler above: the
  // question is "does the container own the clipboard right now?", and a `copy`
  // event's target follows the DOM selection, which can still sit inside a blurred
  // block's text node. No handler moves focus during a clipboard dispatch.

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
    [writeClipboard, containerRef],
  );

  const onCut = useCallback(
    (e: React.ClipboardEvent) => {
      if (document.activeElement !== containerRef.current) return;
      if (writeClipboard(e)) {
        bulkDelete([...selectedRef.current]);
        clearSelection();
      }
    },
    [writeClipboard, bulkDelete, clearSelection, containerRef],
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
    [handles, paste, focusedBlockId, headRef, containerRef],
  );

  // ---- Marquee drag-select on the empty container background ---------------

  const [marquee, setMarquee] = useState<{ top: number; height: number } | null>(
    null,
  );
  const marqueeStartRef = useRef<{ id: string | null; x: number; y: number } | null>(null);
  const marqueeMovedRef = useRef(false);

  // Notion-style click-to-edit on the empty editor background: a plain click
  // (no drag) routes the caret to a block instead of doing nothing. Above the
  // first block focuses it; the trailing zone below the last block focuses it
  // when it's an empty default-text block, otherwise appends a fresh paragraph;
  // an empty page gets its first block. A click in the side margin beside a
  // block (or a gap between blocks) lands the caret in the nearest block at the
  // line edge closest to the click X — end for the right margin, start for the
  // left; a block with no caret handle (image, etc.) is selected instead. Only a
  // page with zero blocks falls through to clearing the selection.
  const onEmptyClick = useCallback(
    (x: number, y: number) => {
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
      const row = rowAtPointer(y);
      if (row) {
        const rect = contentRef.current?.getBoundingClientRect();
        const edge: "start" | "end" =
          rect && x >= rect.left + rect.width / 2 ? "end" : "start";
        if (!focusBlockBoundary(row.id, edge)) applyRange(row.id, row.id);
        return;
      }
      clearSelection();
    },
    [flat, handles, focusBlock, insert, clearSelection, applyRange, focusBlockBoundary],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      const el = e.target as HTMLElement;
      // Only start on empty background — never over a block, gutter button, or
      // editable text (those have their own pointer behavior). A row's gutter
      // rail is its own padding, so a hit on the row element ITSELF is the rail
      // (background); only a hit on a descendant is block content.
      const row = el.closest("[data-block-id]");
      if (
        (row && row !== el) ||
        el.closest("button") ||
        el.closest('[contenteditable="true"]')
      ) {
        return;
      }
      const start = rowAtPointer(e.clientY);
      marqueeStartRef.current = { id: start?.id ?? null, x: e.clientX, y: e.clientY };
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
          const s = marqueeStartRef.current;
          if (s) onEmptyClick(s.x, s.y);
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
  // The ref is the synchronous source of truth for the in-flight pointer
  // handlers (`currentTarget` reads it within the same dnd-kit event, before any
  // re-render); the mirrored STATE drives render so rows re-highlight when the
  // bulk set changes (reading the ref in render would leave a stale highlight).
  type BulkDrag = { roots: string[]; subtree: Set<string> } | null;
  const bulkDragRef = useRef<BulkDrag>(null);
  const [bulkDrag, setBulkDrag] = useState<BulkDrag>(null);
  const setBulkDragState = useCallback((next: BulkDrag) => {
    bulkDragRef.current = next;
    setBulkDrag(next);
  }, []);

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
      setBulkDragState({ roots, subtree });
    } else {
      setBulkDragState(null);
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
    setBulkDragState(null);
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

    // Positional intent; `move` resolves the destination parent + predicted rank
    // over the editor's complete forest and posts `{parentId, targetId, zone}`.
    move(dragged, target.zone, target.id);
  };

  const onDragCancel = () => {
    setDropTarget(null);
    setActiveId(null);
    setBulkDragState(null);
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
  }, [containerRef]);

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
              <IconButton
                icon={MdFormatIndentDecrease}
                label="Outdent"
                shortcut="shift+tab"
                disabled={!outdentable}
                onClick={() => {
                  outdentBlocks(roots);
                  focusContainer();
                }}
              />
              <IconButton
                icon={MdFormatIndentIncrease}
                label="Indent"
                shortcut="tab"
                disabled={!indentable}
                onClick={() => {
                  indentBlocks(roots);
                  focusContainer();
                }}
              />
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
            onFocusCapture={onFocusCapture}
            // Full-surface file-drop scrim painted above the blocks (a
            // pointer-events-none `above` layer, so it never eats the drag
            // events). The per-row insertion line below still pinpoints the drop.
            above={<FileDropOverlay active={fileDragging} />}
            className="min-h-40 w-full cursor-text pb-sm pt-md outline-none"
          >
            {/* This wrapper owns the horizontal gutters: `contentClassName`
                supplies width/centering only (no horizontal padding of its own).
                The LEFT rail lives inside each row's own padding (the three hover
                controls hang into it at -20/-40/-60 from the content edge — see
                page-column's BLOCK_GUTTER), so this wrapper zeroes its own left
                padding and hands the full inset to the rows; the matching right
                gutter stays here, keeping the text measure symmetric. */}
            <div
              ref={contentRef}
              className={cn("relative", contentClassName)}
              style={{ paddingLeft: 0, paddingRight: BLOCK_GUTTER }}
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
                    (bulkDrag?.subtree.has(f.block.id) ?? false)
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
              {bulkDrag && selectedCount > 1 ? (
                <Text variant="body">{`${selectedCount} blocks`}</Text>
              ) : null}
            </Stack>
          ) : null}
        </DragOverlay>
      </DndContext>
    </SelectionControlProvider>
  );
}
