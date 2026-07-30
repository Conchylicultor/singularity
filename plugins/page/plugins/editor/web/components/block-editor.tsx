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
import {
  canIndent,
  canOutdent,
  pasteAnchorId,
  textOf,
  planForestInsert,
  withMintedIds,
  serializeForestToMarkdown,
  parseMarkdownToForest,
  defaultTextHandle,
  type Block,
  type BlockHandle,
  type SerializedBlock,
} from "../../core";
import { fromNodes, toNodes } from "../internal/optimistic-block-ops";
import type { CaretSurface, CaretSurfaceRef } from "../caret-surface";
import { BlockEditorProvider, useBlockEditor } from "../block-editor-context";
import { Editor, useFramedBlockTypes } from "../slots";
import { computeFrameSpans, type FlatBlock, type FrameSpan } from "../internal/block-frames";
import { useBlockHandles } from "../internal/block-handles";
import { serializeForest } from "../serialize-blocks";
import { SelectionControlProvider } from "../selection-control";
import { useBlockSelection, type BlockSelectionActions } from "../internal/use-block-selection";
import { BlockRow, gutterFirstLineCenter } from "./block-row";
import { BLOCK_GUTTER, blockContentLeft } from "../internal/page-column";
import { FileDropOverlay } from "./file-drop-overlay";
import {
  resolveBlockPasteHandler,
  resolvePastedBlock,
  type BlockPasteHandler,
} from "../internal/block-paste-handlers";
import { BLOCKS_MIME } from "../internal/clipboard";

/** The editor drops *between* rows only — it has no tree `child` reparent zone. */
type SiblingZone = Extract<DropZone, "before" | "after">;
type DropTarget = { id: string; zone: SiblingZone };

// Depth-first flatten that carries each block's depth. Rendering the tree as a
// flat list of keyed siblings (rather than nesting children inside their parent's
// DOM) keeps every block in the same React parent, so indent/outdent/move only
// reorder keyed elements — the Lexical editor instance (and its focus) survives.
//
// `alwaysExpanded` is the set of types whose handle declares
// `collapsible: "never"` — their stored `expanded` flag is IGNORED here. That is
// what makes the flag inert rather than dangerous: a type with no chevron (an
// anchor renders no line at all) could otherwise be left permanently collapsed,
// hiding its children behind nothing, and every creation path mints `false`
// (`applySplit`, `applyInsert`, any patch replay writes it verbatim).
function flattenTree(
  nodes: TreeNode<Block>[],
  depth: number,
  out: FlatBlock[],
  alwaysExpanded: ReadonlySet<string>,
): void {
  // `ordinal` is the 1-based position within the maximal run of consecutive
  // same-type siblings (resets on type change). Each recursive call into a
  // node's children starts a fresh counter, so numbering resets per level.
  let ordinal = 0;
  let prevType: string | null = null;
  for (const node of nodes) {
    ordinal = node.type === prevType ? ordinal + 1 : 1;
    prevType = node.type;
    const expanded = node.expanded || alwaysExpanded.has(node.type);
    out.push({
      block: node,
      depth,
      hasChildren: node.children.length > 0,
      ordinal,
      firstVisibleChildType: expanded ? node.children[0]?.type ?? null : null,
    });
    // Skip a collapsed node's subtree so its children stay hidden. `expanded`
    // defaults true for every existing row, so current documents are unchanged.
    if (expanded) flattenTree(node.children, depth + 1, out, alwaysExpanded);
  }
}

/**
 * Each flat index's RAIL SEAT: the content edge its hover controls hang back
 * from. For an unframed row that is its own content edge; for a row inside one
 * or more container frames it is the OUTERMOST one's — so the controls sit
 * outside the box and leave the container's own decoration column free. See
 * `internal/page-column.ts` for why that is forced rather than preferred.
 *
 * `computeFrameSpans` walks the flatten in order, so an enclosing frame (which
 * necessarily starts at a lower index) is always emitted BEFORE the frames it
 * contains: the first span covering an index is its outermost one.
 */
function computeRailLefts(
  flat: readonly FlatBlock[],
  spans: readonly FrameSpan[],
): number[] {
  const out = flat.map((f) => blockContentLeft(f.depth));
  const seated = new Array<boolean>(flat.length).fill(false);
  for (const span of spans) {
    const left = blockContentLeft(span.depth);
    for (let i = span.start; i <= span.end; i += 1) {
      if (seated[i]) continue;
      seated[i] = true;
      out[i] = left;
    }
  }
  return out;
}

/**
 * A container ANCHOR's BORROWED first-line center. The anchor renders no line of
 * its own, so `--gutter-first-line-center` — derived from a row's own handle —
 * is structurally unknowable for it; hardcoding the body center puts the glyph
 * ~6px high against an H1 child and tens of px off against a divider/image child
 * that declares its own center, and the error grows with the density preset.
 *
 * The flatten is depth-first, so an anchor's first visible child is ALWAYS the
 * immediately-following entry — walk forward through nested anchors to the first
 * row that actually renders a line, and read that handle's seat. An anchor with
 * no visible children terminates the walk on itself and takes its own (default)
 * seat, which is exactly the one-line fallback box it renders.
 */
function borrowedFirstLineCenters(
  flat: readonly FlatBlock[],
  handleOf: (type: string) => BlockHandle<unknown> | undefined,
): (string | undefined)[] {
  return flat.map((f, i) => {
    if (handleOf(f.block.type)?.anchor !== true) return undefined;
    let j = i;
    while (
      flat[j]!.firstVisibleChildType !== null &&
      handleOf(flat[j]!.block.type)?.anchor === true
    ) {
      j += 1;
    }
    return gutterFirstLineCenter(handleOf(flat[j]!.block.type));
  });
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
    // A container ANCHOR row is ZERO height while its children are visible, and
    // its single pixel line coincides with its first child's top. Without the
    // guard it "contains" that line, wins on DOM order, and resolves to `after`
    // — i.e. AFTER the anchor but BEFORE its children, which reads as "outside
    // the box": the visual opposite of dropping before the container. The
    // nearest-distance fallback below still reaches it (and resolves `before`),
    // which is what keeps "drop above a leading callout" possible at all.
    if (r.height > 0 && y >= r.top && y <= r.bottom) return { id, zone };
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
 *
 * Storage-agnostic — available in both the persistent and in-memory modes.
 */
export interface BlockEditorHandle extends CaretSurface {
  /**
   * Open the top of the page for typing: focus the first block when it is
   * already an empty text block, otherwise insert a fresh one before it. Drives
   * the page title's Enter key.
   */
  insertFirstBlock(): void;
}

/**
 * `onOpenPage` is an optional navigation callback for link/mention block
 * renderers. Decoupled from any host app's pane (mirrors file-links'
 * `onFileOpen`); the host wires it when mounting `<BlockEditor>`.
 *
 * `contentClassName` is applied to the centered block-content wrapper (e.g. a
 * reading measure like `mx-auto max-w-4xl px-lg`). The pointer/marquee surface
 * always fills the full host width, so drag-selecting and click-to-edit work
 * across the whitespace beside a narrow content column; only the blocks
 * themselves are constrained by this class. Omit it (the story host) to let block
 * content fill the full width.
 *
 * `caretBefore` / `caretAfter` are the caret surfaces the host renders immediately
 * before / after the block list (the page title above it). Caret navigation that
 * leaves the first block backwards — ArrowUp, ArrowLeft at its start, Backspace at
 * its start — or the last block forwards lands there instead of stopping at the
 * editor's edge. Omit them (the story host, the in-memory demo) and those
 * keystrokes simply do nothing.
 */
type BlockEditorProps = {
  onOpenPage?: (pageId: string) => void;
  contentClassName?: string;
  ref?: Ref<BlockEditorHandle>;
  caretBefore?: CaretSurfaceRef;
  caretAfter?: CaretSurfaceRef;
} & (
  | {
      /** Persistent mode (default): read/write `blocksResource` + endpoints. */
      pageId: string;
      persist?: true;
    }
  | {
      /**
       * In-memory mode: a self-contained, non-persisting editor. No `pageId`, no
       * server rows — seeded from portable `initialContent` and (optionally)
       * restricted to `enabledBlockTypes`.
       */
      persist: false;
      /** Portable seed forest (no ids/ranks); materialized once at mount. */
      initialContent?: SerializedBlock[];
      /** Allowlist of insertable block `type`s for the palette. */
      enabledBlockTypes?: readonly string[];
    }
);

// `ref` is destructured out of `props` in the SIGNATURE, never read as
// `props.ref`: a ref reachable through an object taints every read of that object
// during render for `react-hooks/refs`, so `props.pageId` would be flagged too.
// Pulled out here, `props` is plain data and `ref` is forwarded untouched.
export function BlockEditor({ ref, ...props }: BlockEditorProps) {
  if (props.persist === false) {
    return (
      <MemoryBlockEditor
        initialContent={props.initialContent}
        enabledBlockTypes={props.enabledBlockTypes}
        onOpenPage={props.onOpenPage}
        contentClassName={props.contentClassName}
        caretBefore={props.caretBefore}
        caretAfter={props.caretAfter}
        handleRef={ref}
      />
    );
  }
  return (
    // No undo provider here: the command history belongs to the TAB (mounted in
    // `TabSurface`), and the editor is one participant recording into it. Its
    // entries are mount-scoped (`useScopedUndoRedo` in `BlockEditorProvider`), so
    // they drop when this editor unmounts.
    <BlockEditorProvider
      pageId={props.pageId}
      onOpenPage={props.onOpenPage}
      caretBefore={props.caretBefore}
      caretAfter={props.caretAfter}
    >
      <BlockEditorInner contentClassName={props.contentClassName} handleRef={ref} />
    </BlockEditorProvider>
  );
}

/**
 * In-memory editor host: mints a stable synthetic page id and materializes the
 * portable `initialContent` seed into real `Block[]` rows once (via the shared
 * `planForestInsert`), then drives the same editor surface through the
 * non-persisting `BlockStore`. Rows still carry a `pageId` so the reducer's
 * indent/outdent/insert (which key on it) keep working unchanged.
 */
function MemoryBlockEditor({
  initialContent,
  enabledBlockTypes,
  onOpenPage,
  contentClassName,
  caretBefore,
  caretAfter,
  handleRef,
}: {
  initialContent?: SerializedBlock[];
  enabledBlockTypes?: readonly string[];
  onOpenPage?: (pageId: string) => void;
  contentClassName?: string;
  caretBefore?: CaretSurfaceRef;
  caretAfter?: CaretSurfaceRef;
  handleRef?: Ref<BlockEditorHandle>;
}) {
  const pageId = useMemo(() => crypto.randomUUID(), []);
  const initialBlocks = useMemo(() => {
    const forest = initialContent ?? [];
    // Top-level content is parented to the synthetic page block, matching the
    // persistent shape (`computePageId(pageId) === pageId`).
    const { nodes } = planForestInsert({
      pageId,
      parentId: pageId,
      rootRanks: Rank.nBetween(null, null, forest.length),
      forest: withMintedIds(forest),
    });
    return fromNodes(nodes, []);
  }, [pageId, initialContent]);

  return (
    <BlockEditorProvider
      persist={false}
      pageId={pageId}
      initialBlocks={initialBlocks}
      enabledBlockTypes={enabledBlockTypes}
      onOpenPage={onOpenPage}
      caretBefore={caretBefore}
      caretAfter={caretAfter}
    >
      <BlockEditorInner contentClassName={contentClassName} handleRef={handleRef} />
    </BlockEditorProvider>
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

  // The Cmd+Z / Cmd+Shift+Z / Cmd+Y bindings are NOT registered here — they are
  // the tab's (`TabSurface` mounts `useUndoRedoShortcuts()` once per surface, so
  // the sidebar's deletes and the body's edits answer to the same keys and cannot
  // double-register). Nothing in the editor consumes those keys either (no Lexical
  // HistoryPlugin), so the native keydown bubbles to the window-level
  // ShortcutManager untouched, regardless of which DOM element (a contenteditable,
  // the selection container, or <body> after a structural undo) holds the caret.

  // Block handles, read once here: the flatten needs them (which types ignore
  // their stored `expanded`) and so does `insertFirstBlock` below.
  const contributions = Editor.Block.useContributions();

  const { rows, flat } = useMemo(() => {
    if (pending) {
      return { rows: [] as Block[], flat: [] as FlatBlock[] };
    }
    const alwaysExpanded = new Set(
      contributions
        .filter((c) => c.block.collapsible === "never")
        .map((c) => c.block.type),
    );
    const sorted = [...blocks].sort((a, b) => Rank.compare(a.rank, b.rank));
    const tree = buildTree(sorted);
    const out: FlatBlock[] = [];
    flattenTree(tree, 0, out, alwaysExpanded);
    return { rows: sorted, flat: out };
  }, [blocks, pending, contributions]);

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
    allowAttachments,
  } = useBlockEditor();
  const { selectedIds } = useMultiSelect();
  // ONE `type → handle` view of the `Editor.Block` registry (`useBlockHandles`),
  // shared by the per-type lookups below and the list consumers (markdown
  // serialize/parse, `defaultTextHandle`). Both derive from the same
  // registrations, so a second local `handles.find(...)` was only a slower copy.
  const handleMap = useBlockHandles();
  const handles = useMemo(() => [...handleMap.values()], [handleMap]);

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

  // Structural, so this serves both React's delegated `copy`/`cut` (where the event
  // originates inside the container) and a raw DOM `ClipboardEvent` caught at the
  // document — which is how the selection bar's button copies, since it renders
  // outside the container and its event never reaches `onCopy` below.
  const writeClipboard = useCallback(
    (e: { clipboardData: DataTransfer | null; preventDefault: () => void }) => {
      const roots = selectionRoots(rowsRef.current, selectedRef.current);
      if (roots.length === 0) return false;
      const clipboardData = e.clipboardData;
      if (clipboardData === null) return false;
      const forest = serializeForest(rowsRef.current, roots);
      clipboardData.setData(BLOCKS_MIME, JSON.stringify(forest));
      clipboardData.setData("text/plain", serializeForestToMarkdown(forest, handles));
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

  /**
   * Copy the block selection from the selection bar's BUTTON, which has no clipboard
   * event of its own to write into — so it has to provoke one. Two reasons it cannot
   * just lean on `onCopy` above, both structural:
   *
   *  - The bar renders OUTSIDE this container (a React sibling, not a descendant),
   *    so a `copy` provoked from it targets the button and never reaches the
   *    container's delegated `onCopy`. We catch it at the document instead.
   *  - `execCommand("copy")` only emits `copy` at all when the document has a
   *    selection to copy, and block-selection mode deliberately holds none: entering
   *    it relinquishes the text caret, because a caret parked in a blurred block lets
   *    an untagged Lexical reconcile yank focus back out of the container (see
   *    `releaseCaret` in `internal/use-block-selection.ts`). So seat a throwaway
   *    range over the container to make the event fire.
   *
   * Until this was made explicit, the button worked only by accident of that stale
   * caret: it put the event target inside a block, and hence inside the container.
   *
   * The range's own text never reaches the clipboard — `writeClipboard`
   * preventDefaults and substitutes the serialized forest. Neither the range nor the
   * listener can leak: `execCommand` dispatches `copy` synchronously, so nothing can
   * interleave before both are torn down.
   */
  const copySelectionViaButton = useCallback(() => {
    const container = containerRef.current;
    if (container === null) return;
    const doc = container.ownerDocument;
    const write = (e: ClipboardEvent) => void writeClipboard(e);
    doc.addEventListener("copy", write, { capture: true, once: true });
    try {
      // Never scroll the viewport just to seat the clipboard.
      container.focus({ preventScroll: true });
      const sel = doc.defaultView?.getSelection();
      const range = doc.createRange();
      range.selectNodeContents(container);
      sel?.removeAllRanges();
      sel?.addRange(range);
      doc.execCommand("copy");
      sel?.removeAllRanges();
    } finally {
      doc.removeEventListener("copy", write, { capture: true });
    }
  }, [writeClipboard, containerRef]);

  const onPaste = useCallback(
    (e: React.ClipboardEvent) => {
      if (document.activeElement !== containerRef.current) return;
      // A pasted file (image/video/audio/…) becomes an attachment block, inserted
      // after the current selection — resolved through the generic registry so
      // this consumer never names a specific block type. Skipped entirely in the
      // in-memory (non-persisting) mode: there is no server to store the blob.
      const picked = allowAttachments ? resolvePastedBlock(e.clipboardData) : null;
      if (picked) {
        e.preventDefault();
        const { file, handler } = picked;
        const afterId = pasteAnchorId(toNodes(rowsRef.current), selectedRef.current, focusedBlockId);
        void (async () => {
          const data = await handler.build(file);
          paste({
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
        forest = parseMarkdownToForest(text, handles);
      }
      if (!Array.isArray(forest) || forest.length === 0) return;
      e.preventDefault();
      const afterId = pasteAnchorId(toNodes(rowsRef.current), selectedRef.current, focusedBlockId);
      paste({ blocks: forest, afterId });
    },
    [handles, paste, focusedBlockId, containerRef, allowAttachments],
  );

  // ---- Pointer drag-select (background marquee + cross-block text promotion) --

  const [marquee, setMarquee] = useState<{ top: number; height: number } | null>(
    null,
  );
  /**
   * `background` — the press landed on empty surface (a row's gutter rail, the gap
   * between rows, the area below the last block). Block-selection starts on the
   * press and the marquee rectangle is painted.
   *
   * `text` — the press landed INSIDE a block's contenteditable. The BROWSER owns
   * this gesture, and we do not interfere with it, right up until the pointer
   * leaves the origin row.
   */
  type DragMode = "background" | "text";
  const dragStartRef = useRef<{
    id: string | null;
    x: number;
    y: number;
    mode: DragMode;
  } | null>(null);
  const dragMovedRef = useRef(false);
  /**
   * A text drag that has crossed a block boundary and been taken over as a block
   * range. Mirrored into state because it suppresses native text selection for the
   * rest of the gesture (below), which is a render concern.
   */
  const textDragPromotedRef = useRef(false);
  const [textDragPromoted, setTextDragPromoted] = useState(false);

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
        // A pointer landing states WHERE it wants the caret, like the in-row
        // branch below — never a bare `focusBlock`, whose `focus()` restores the
        // block's last caret position (right for a structural re-focus, wrong
        // for a click that means "the very top of the page").
        //
        // `focusBlockBoundary` returns false for a row that registered no focus
        // handle — a container ANCHOR has no line to focus, so it never does.
        // Advance to the first row that CAN take a caret before falling back to
        // selecting: clicking above a leading callout must open the top of the
        // page, not select the callout.
        for (const f of flat) {
          if (focusBlockBoundary(f.block.id, "start")) return;
        }
        applyRange(firstId, firstId);
        return;
      }
      if (y > lastEl.getBoundingClientRect().bottom) {
        if (fallback && lastBlock.type === fallback.type && textOf(lastBlock) === "") {
          focusBlockBoundary(lastBlock.id, "end");
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
    [flat, handles, insert, clearSelection, applyRange, focusBlockBoundary],
  );

  /**
   * One pointer-drag gesture, two entry points, one tracking loop.
   *
   * The `text` entry is what makes a selection cross a block boundary at all.
   * Every text-bearing block mounts its OWN Lexical instance, i.e. its own
   * contenteditable EDITING HOST, and a browser clamps a mouse selection to the
   * host it started in — so dragging out of a block does not extend the selection,
   * it COLLAPSES it back to a bare caret, and Cmd+C copies "" (measured in
   * `e2e/cross-block-text-selection-probe.ts`). There is no partial cross-block
   * selection to preserve, so at the boundary we take the gesture over and promote
   * it to a whole-block range: Notion's model, and the one the block-selection
   * machinery (highlight, markdown clipboard, bulk ops) is already built for.
   *
   * Promotion is deliberately ONE-WAY. Dragging back into the origin block leaves
   * that block selected whole rather than re-seating a partial caret: restoring a
   * caret mid-drag means putting one back into a blurred block, which is exactly
   * the state `releaseCaret` exists to prevent (an untagged `@lexical/yjs`
   * reconcile reads it as "the caret didn't move" and reclaims DOM focus with no
   * user input — see `internal/use-block-selection.ts`).
   */
  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      const el = e.target as HTMLElement;
      // Reject any press that did not originate inside this editor's own DOM
      // subtree. A caret menu (and any future overlay a block mounts) renders
      // through a portal to document.body, so its row sits OUTSIDE containerRef
      // in the DOM even though React still bubbles the synthetic event here.
      // The DOM-based guard below reasons over the real tree, so without this a
      // portaled menu press masquerades as an empty-background click and arms a
      // stray trailing-paragraph insert that races the menu's own conversion.
      if (!containerRef.current?.contains(el)) return;
      // A gutter/inline control owns its own press outright, in either mode.
      if (el.closest("button")) return;

      const row = el.closest("[data-block-id]");
      const inText = el.closest('[contenteditable="true"]') !== null;
      // A row's gutter rail is its own padding, so a hit on the row element ITSELF
      // is the rail (background); only a hit on a descendant is block content.
      const onBackground = !inText && !(row && row !== el);
      // Block content that is neither background nor editable text — an image, a
      // page-link card, a checkbox — keeps its own pointer behavior.
      if (!onBackground && !inText) return;

      const mode: DragMode = onBackground ? "background" : "text";
      const originId = inText
        ? (row?.getAttribute("data-block-id") ?? null)
        : (rowAtPointer(e.clientY)?.id ?? null);

      dragStartRef.current = { id: originId, x: e.clientX, y: e.clientY, mode };
      dragMovedRef.current = false;
      textDragPromotedRef.current = false;
      // A text press must reach the browser untouched — that IS the intra-block
      // selection. Only the background entry claims the editor up front.
      if (mode === "background") focusContainer();

      const onMove = (ev: PointerEvent) => {
        const start = dragStartRef.current;
        if (!start) return;
        const cur = rowAtPointer(ev.clientY);

        if (start.mode === "text") {
          if (!textDragPromotedRef.current) {
            // Still inside the origin row: the browser's own intra-block
            // selection is the whole feature here. Hands off.
            if (start.id === null || cur === null || cur.id === start.id) return;
            textDragPromotedRef.current = true;
            setTextDragPromoted(true);
          }
          if (cur && start.id) applyRange(start.id, cur.id);
          // Every move, not just the promoting one: the pointer is still down and
          // the browser is still in select-mode, so it re-seats a range in the
          // origin host given any chance. `select-none` (below) is what stops it
          // re-arming; this drops whatever it managed to seat before that landed.
          focusContainer();
          return;
        }

        const content = contentRef.current;
        if (content) {
          const r = content.getBoundingClientRect();
          const top = Math.min(start.y, ev.clientY) - r.top;
          const height = Math.abs(ev.clientY - start.y);
          if (height > 3) {
            dragMovedRef.current = true;
            setMarquee({ top, height });
          }
        }
        if (cur && start.id) applyRange(start.id, cur.id);
      };
      const onUp = () => {
        const start = dragStartRef.current;
        // A plain click (no drag) on the empty background routes the caret to a
        // block; a drag was a marquee selection and is left alone. A text press
        // needs neither — the browser already placed the caret.
        if (start && start.mode === "background" && !dragMovedRef.current) {
          onEmptyClick(start.x, start.y);
        }
        dragStartRef.current = null;
        textDragPromotedRef.current = false;
        setTextDragPromoted(false);
        setMarquee(null);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [applyRange, focusContainer, onEmptyClick, containerRef],
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
    // No blob storage in the in-memory (non-persisting) mode, so a dropped file
    // must never reach an upload: refuse the drag entirely.
    if (!allowAttachments) return;
    // Only react to an OS file drag — internal text/element drags carry no Files.
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault(); // required so the drop event fires
    e.dataTransfer.dropEffect = "copy";
    setFileDragging(true);
    const next = rowAtPointer(e.clientY);
    setFileDropTarget((prev) =>
      prev?.id === next?.id && prev?.zone === next?.zone ? prev : next,
    );
  }, [allowAttachments]);

  const onFileDragLeave = useCallback((e: React.DragEvent) => {
    // dragleave fires when crossing into a child too; only clear when the pointer
    // has actually left the container's subtree.
    if (containerRef.current?.contains(e.relatedTarget as Node | null)) return;
    setFileDragging(false);
    setFileDropTarget(null);
  }, [containerRef]);

  const onFileDrop = useCallback(
    (e: React.DragEvent) => {
      // In-memory mode has no server to store a blob — never begin an upload.
      if (!allowAttachments) return;
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
        paste({ blocks, ...pos });
      })();
    },
    [fileDropPosition, paste, allowAttachments],
  );

  // The reorder drag and the file drag are mutually exclusive, so one indicator
  // source feeds the per-row insertion line.
  const activeDropTarget = dropTarget ?? fileDropTarget;

  const selectedCount = selectedIds.size;

  // Container block types (callout, …) paint a decorated box over their own row
  // plus their visible subtree. The box is a SIBLING of the rows, spanning them
  // by grid line number — never an ancestor. See `internal/block-frames.ts`:
  // wrapping the rows would change their DOM parent on every Tab across a frame
  // boundary, remounting the block's Lexical instance and losing the caret.
  const framedTypes = useFramedBlockTypes();
  const frameSpans = useMemo(
    () => computeFrameSpans(flat, framedTypes),
    [flat, framedTypes],
  );

  // Per-row geometry the ROWS must not derive themselves (see
  // `internal/page-column.ts`): where each row seats its hover rail, and — for a
  // container anchor — the first-line center it borrows from its first child.
  const handleOf = useCallback(
    (type: string) => handleMap.get(type),
    [handleMap],
  );
  const railLefts = useMemo(
    () => computeRailLefts(flat, frameSpans),
    [flat, frameSpans],
  );
  const anchorCenters = useMemo(
    () => borrowedFirstLineCenters(flat, handleOf),
    [flat, handleOf],
  );

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
                onClick={copySelectionViaButton}
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
            className={cn(
              "min-h-40 w-full cursor-text pb-sm pt-md outline-none",
              // A text drag that crossed a block boundary is a BLOCK range now.
              // The pointer is still down, so without this the browser keeps
              // re-seating a text range in the origin host every frame and the two
              // highlights fight. Lasts only for the rest of the gesture.
              textDragPromoted && "select-none",
            )}
          >
            {/* This wrapper owns the horizontal gutters: `contentClassName`
                supplies width/centering only (no horizontal padding of its own).
                The LEFT rail lives inside each row's own padding (the three hover
                controls hang into it at -20/-40/-60 from the content edge — see
                page-column's BLOCK_GUTTER), so this wrapper zeroes its own left
                padding and hands the full inset to the rows; the matching right
                gutter stays here, keeping the text measure symmetric. */}
            {/* A single-column CSS grid, with EVERY row placed explicitly on its
                own line. That is what lets a container's frame be a sibling that
                merely spans lines `start..end` instead of an ancestor wrapping
                the rows — so a block crossing a frame boundary keeps its DOM
                parent (and its live Lexical instance + caret). Rows are placed
                explicitly rather than auto-flowed so the frames, which ARE
                explicitly placed, cannot perturb their order. */}
            <div
              ref={contentRef}
              // eslint-disable-next-line layout/no-adhoc-layout -- the block list is a single-column grid so container frames can span row lines; the ramp has no primitive for line-spanning overlays
              className={cn("relative grid grid-cols-1", contentClassName)}
              style={{ paddingLeft: 0, paddingRight: BLOCK_GUTTER }}
            >
              {/* Frames first in DOM order so they paint BEHIND the rows they
                  span (equal stacking level → document order decides).

                  A container ANCHOR's block-selection highlight rides on THIS
                  wrapper rather than on its row: the row is zero height, so a
                  ring on it is invisible and one ArrowDown in selection mode
                  reads as a dead keypress. Ringing the whole box is also simply
                  the right visual — selecting a callout selects the callout. The
                  wrapper stays `pointer-events-none`. */}
              {frameSpans.map((span) => (
                <div
                  key={`frame:${span.block.id}`}
                  // eslint-disable-next-line layout/no-adhoc-layout -- grid-row span placement is the point of this element; `relative` gives the frame a positioned box to paint into
                  className={cn(
                    "pointer-events-none relative col-start-1",
                    handleOf(span.block.type)?.anchor === true &&
                      selectedIds.has(span.block.id) &&
                      "bg-primary/10 ring-primary/30 rounded-md ring-1",
                  )}
                  style={{ gridRow: `${span.start + 1} / ${span.end + 2}` }}
                >
                  <Editor.BlockFrame.Dispatch
                    type={span.block.type}
                    data={span.block.data}
                    inset={blockContentLeft(span.depth)}
                  />
                </div>
              ))}
              {flat.map((f, i) => (
                <div
                  key={f.block.id}
                  // eslint-disable-next-line layout/no-adhoc-layout -- explicit grid line placement keeps rows ordered independently of the frames; not a ramp-expressible anchor
                  className="col-start-1"
                  style={{ gridRow: i + 1 }}
                >
                  <BlockRow
                    block={f.block}
                    depth={f.depth}
                    hasChildren={f.hasChildren}
                    hasVisibleChildren={f.firstVisibleChildType !== null}
                    ordinal={f.ordinal}
                    railLeft={railLefts[i]!}
                    borrowedFirstLineCenter={anchorCenters[i]}
                    isDragging={
                      activeId === f.block.id ||
                      (bulkDrag?.subtree.has(f.block.id) ?? false)
                    }
                    dropZone={
                      activeDropTarget?.id === f.block.id ? activeDropTarget.zone : null
                    }
                  />
                </div>
              ))}
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
