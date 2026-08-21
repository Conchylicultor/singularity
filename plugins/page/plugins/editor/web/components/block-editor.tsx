import type { ClassName } from "@plugins/primitives/plugins/css/plugins/ui-kit/core";
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
} from "@plugins/primitives/plugins/tree/core";
import {
  MultiSelectProvider,
  SelectionBar,
  useMultiSelect,
} from "@plugins/primitives/plugins/multi-select/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { ContentScope } from "@plugins/primitives/plugins/select-scope/web";
import { surfaceUndoProps } from "@plugins/primitives/plugins/undo-redo/web";
import {
  useEventCallback,
  useLatestRef,
} from "@plugins/primitives/plugins/latest-ref/web";
import { useEdgeAutoScroll } from "@plugins/primitives/plugins/auto-scroll/web";
import {
  canIndent,
  canOutdent,
  pasteAnchorId,
  textOf,
  planForestInsert,
  withMintedIds,
  newBlockId,
  parseMarkdownToForest,
  defaultTextHandle,
  plainOf,
  runsOfNode,
  type Block,
  type SerializedBlock,
} from "../../core";
import { fromNodes, toNodes } from "../internal/optimistic-block-ops";
import type { CaretSurface, CaretSurfaceRef } from "../caret-surface";
import { BlockEditorProvider, useBlockEditor } from "../block-editor-context";
import { Editor, useFramedBlockTypes } from "../slots";
import { computeFrameSpans, type FlatBlock } from "../internal/block-frames";
import { flattenVisible } from "../internal/flatten-blocks";
import { resolveRailSeats } from "../internal/rail-seat";
import { resolveSelectionBands } from "../internal/selection-bands";
import { useAnchorTypes, useBlockHandles } from "../internal/block-handles";
import { serializeForest } from "../serialize-blocks";
import { SelectionControlProvider } from "../selection-control";
import {
  useBlockSelection,
  BLOCK_LIST_ARIA,
  type BlockSelectionActions,
} from "../internal/use-block-selection";
import { BlockRow } from "./block-row";
import { SelectionBands } from "./selection-bands";
import { BLOCK_GUTTER, blockContentLeft } from "../internal/page-column";
import { ExternalDropOverlay } from "./external-drop-overlay";
import {
  resolveBlockPasteHandler,
  resolvePastedBlock,
  type BlockPasteHandler,
} from "../internal/block-paste-handlers";
import {
  BLOCKS_MIME,
  decideTransfer,
  readTransferText,
} from "../internal/transfer";
import { dragKindFromTypes, type ClaimedKind } from "../internal/drag-kind";
import { writeForestToClipboard } from "../internal/clipboard-write";
import { blockTextProtectedSpans } from "../internal/block-text-extensions";

/**
 * How much of a block's text the spoken selection announcement quotes. Long
 * enough to tell two blocks apart, short enough that arrowing down a page is not
 * a reading of the page.
 */
const PREVIEW_CHARS = 80;

/** The editor drops *between* rows only — it has no tree `child` reparent zone. */
type SiblingZone = Extract<DropZone, "before" | "after">;
type DropTarget = { id: string; zone: SiblingZone };

// Find the rendered block row under a vertical pointer position, plus whether the
// pointer sits in its top (before) or bottom (after) half. Reads live DOM rects
// rather than dnd-kit's cached droppable rects, which drift off-by-one as block
// heights settle. Falls back to the nearest row when between/outside rows.
//
// That fallback is load-bearing for drag-select's edge auto-scroll, not merely
// tolerant: a pointer held BELOW the last block resolves to the last row, so the
// range keeps extending onto whatever scrolls into view under it. A version that
// returned null off-content would freeze the selection the moment the drag left
// the content box — i.e. exactly when auto-scroll takes over.
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
 * Did this event land inside a block's own EDITING HOST (its `contenteditable`),
 * as opposed to the page's chrome — the gutter rail, the whitespace beside the
 * measure, the empty area below the last block?
 *
 * Two gestures ask the same question for the same reason, so they ask it once:
 * a pointer press decides whether the BROWSER owns the text selection it is
 * starting, and a drop decides whether there is an inline insertion point a
 * single line could land in (`decideTransfer`'s `inline`). Both are "is there a
 * caret here that is not ours to place?".
 */
function isInsideEditingHost(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest('[contenteditable="true"]') !== null
  );
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
  contentClassName?: ClassName;
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
      caretBefore={props.caretBefore}
      caretAfter={props.caretAfter}
    >
      <BlockEditorInner
        contentClassName={props.contentClassName}
        handleRef={ref}
      />
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
  contentClassName,
  caretBefore,
  caretAfter,
  handleRef,
}: {
  initialContent?: SerializedBlock[];
  enabledBlockTypes?: readonly string[];
  contentClassName?: ClassName;
  caretBefore?: CaretSurfaceRef;
  caretAfter?: CaretSurfaceRef;
  handleRef?: Ref<BlockEditorHandle>;
}) {
  // Synthetic and never persisted, but still an id in the block namespace — the
  // rows it scopes are ordinary `Block`s the same reducer walks, so it comes
  // from the one mint like every other.
  const pageId = useMemo(() => newBlockId(), []);
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
      caretBefore={caretBefore}
      caretAfter={caretAfter}
    >
      <BlockEditorInner
        contentClassName={contentClassName}
        handleRef={handleRef}
      />
    </BlockEditorProvider>
  );
}

function BlockEditorInner({
  contentClassName,
  handleRef,
}: {
  contentClassName?: ClassName;
  handleRef?: Ref<BlockEditorHandle>;
}) {
  // `blocks`/`pending` come from the provider's optimistic resource so `rowsRef`
  // (set by the effect below) tracks optimistic state — required for chained-op
  // intent resolution (e.g. Enter then Shift+Tab resolving against post-split).
  const {
    setFlatOrder,
    setRows,
    blocks,
    pending,
    insertFirst,
    focusBlock,
    focusBlockBoundary,
  } = useBlockEditor();

  // The Cmd+Z / Cmd+Shift+Z / Cmd+Y bindings are NOT registered here — they are
  // the tab's (`TabSurface` mounts `useUndoRedoShortcuts()` once per surface, so
  // the sidebar's deletes and the body's edits answer to the same keys and cannot
  // double-register). Nothing in the editor consumes those keys either (no Lexical
  // HistoryPlugin), so the native keydown bubbles to the window-level
  // ShortcutManager untouched, regardless of which DOM element (a contenteditable,
  // the selection container, or <body> after a structural undo) holds the caret —
  // the `surfaceUndoProps` marker on the container below is what tells that
  // binding the caret's editing host has no history of its own to protect.

  // Block handles, read once here — `insertFirstBlock` below needs them.
  const contributions = Editor.Block.useContributions();
  // The SAME set the reducer and the server get (`useAnchorTypes`), never a
  // second derivation: the flatten decides what the user sees and the ladders
  // decide what a keystroke acts on, so a divergence here is a keystroke acting
  // on a line that is not on screen.
  const anchorTypes = useAnchorTypes();

  const { rows, flat } = useMemo(() => {
    if (pending) {
      return { rows: [] as Block[], flat: [] as FlatBlock[] };
    }
    const sorted = [...blocks].sort((a, b) => Rank.compare(a.rank, b.rank));
    return {
      rows: sorted,
      flat: flattenVisible(buildTree(sorted), anchorTypes),
    };
  }, [blocks, pending, anchorTypes]);

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
      focusBoundary(edge, opts) {
        // `opts` is forwarded, not dropped: the list is a pass-through surface,
        // so the crossing's scroll intent and its `crossing` direction (which
        // decides whether the target block's edge mark stop is asserted) belong
        // to the block that ends up holding the caret.
        const target = edge === "start" ? flat[0]?.block : flat.at(-1)?.block;
        if (target) focusBlockBoundary(target.id, edge, opts);
      },
      // No `focusAtColumn`: an empty page has no block to measure a column
      // against, and a host entering from above wants the body's start anyway.
    }),
    [contributions, flat, focusBlock, focusBlockBoundary, insertFirst],
  );

  if (pending) {
    return <Loading variant="rows" />;
  }

  return (
    <MultiSelectProvider orderedIds={orderedIds}>
      <SelectionLayer
        rows={rows}
        flat={flat}
        contentClassName={contentClassName}
      />
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
  contentClassName?: ClassName;
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
    attachContainer,
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
  const indentable = useMemo(
    () => canIndent(toNodes(rows), roots),
    [rows, roots],
  );
  const outdentable = useMemo(
    () => canOutdent(toNodes(rows), roots),
    [rows, roots],
  );

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
      const moving = new Set(
        roots.flatMap((r) => subtreeIds(rowsRef.current, r)),
      );
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
        const aboveIdxInRemaining = remaining.findIndex(
          (s) => s.id === above.id,
        );
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
      duplicate: bulkDuplicate,
      focusBlock,
      moveSelection,
    }),
    [
      indentBlocks,
      outdentBlocks,
      bulkDelete,
      bulkDuplicate,
      focusBlock,
      moveSelection,
    ],
  );

  // How a block reads aloud when the selection moves onto it: its type label
  // plus a short preview of its text ("Heading 2: Container frames"), or the
  // label alone for a type that carries none ("Divider"). The block list is a
  // plain group of editing hosts — no role here can carry selection natively —
  // so this is the only place a screen-reader user learns WHICH block they are on.
  //
  // Identity churns whenever the flatten does, which the ~1s `data.text`
  // projection makes about once per typing burst. That is fine and deliberate:
  // `useBlockSelection` calls it only from event handlers, through an event
  // callback, so nothing downstream re-renders because the preview text moved.
  const describeBlock = useCallback(
    (id: string): string => {
      const block = flat.find((f) => f.block.id === id)?.block;
      if (!block) return "Block";
      const label = handleMap.get(block.type)?.label ?? "Block";
      // One line, collapsed whitespace, and short — a screen reader reads this
      // verbatim on every arrow keypress, so it is an identifier, not the content.
      const preview = plainOf(runsOfNode(block))
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, PREVIEW_CHARS)
        .trim();
      return preview === "" ? label : `${label}: ${preview}`;
    },
    [flat, handleMap],
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
    describeBlock,
    actions: selectionActions,
  });

  // The same surface serves the caret authority: while a landing is outstanding
  // (a block created by Enter whose editor hasn't mounted) it parks the caret
  // here and buffers what the user types, so the block they LEFT stops being an
  // editing host and nothing can be typed into it. Detaching aborts any flight.
  useEffect(() => {
    attachContainer(containerRef.current);
    return () => attachContainer(null);
  }, [attachContainer, containerRef]);

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
      writeForestToClipboard(clipboardData, forest, handles);
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
      // A pasted file (image/video/audio/…) is resolved through the generic
      // registry, so this consumer never names a specific block type. Skipped
      // entirely in the in-memory (non-persisting) mode: there is no server to
      // store the blob, so a file must never reach an upload.
      const picked = allowAttachments
        ? resolvePastedBlock(e.clipboardData)
        : null;
      // ONE classification for both doors — this paste and `onExternalDrop`
      // below (`internal/transfer.ts`). `inline: false`: block-selection mode
      // deliberately holds no caret, so there is no insertion point a single
      // line could land in and every text payload becomes blocks.
      const decision = decideTransfer({
        isFile: picked !== null,
        blocksJson: e.clipboardData.getData(BLOCKS_MIME),
        text: readTransferText(e.clipboardData),
        inline: false,
      });
      // Unreachable with `inline: false` — and it is what narrows the union, so
      // the arms below can read `decision.json` / `decision.text`.
      if (decision.kind === "inline") return;

      const afterId = () =>
        pasteAnchorId(
          toNodes(rowsRef.current),
          selectedRef.current,
          focusedBlockId,
        );

      if (decision.kind === "file") {
        e.preventDefault();
        // `isFile` above IS `picked !== null`, so this arm holds that same pick.
        const { file, handler } = picked!;
        const anchor = afterId();
        void (async () => {
          const data = await handler.build(file);
          paste({
            blocks: [
              { type: handler.type, data, expanded: false, children: [] },
            ],
            afterId: anchor,
          });
        })();
        return;
      }

      let forest: SerializedBlock[];
      if (decision.kind === "forest") {
        try {
          forest = JSON.parse(decision.json) as SerializedBlock[];
        } catch (err) {
          if (!(err instanceof SyntaxError)) throw err;
          return;
        }
      } else {
        forest = parseMarkdownToForest(decision.text, {
          handles,
          protectedSpans: blockTextProtectedSpans(),
        });
      }
      // Empty/unparseable forest (an empty or whitespace-only payload) → let the
      // native paste run; never swallow the event for nothing.
      if (!Array.isArray(forest) || forest.length === 0) return;
      e.preventDefault();
      paste({ blocks: forest, afterId: afterId() });
    },
    [handles, paste, focusedBlockId, containerRef, allowAttachments],
  );

  // ---- Pointer drag-select (background marquee + cross-block text promotion) --

  const [marquee, setMarquee] = useState<{
    top: number;
    height: number;
  } | null>(null);
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
  /**
   * The gesture's anchor, in TWO coordinate spaces, deliberately not collapsed
   * into one:
   *
   * - `x` / `y` are VIEWPORT coords, frozen at pointerdown. `onEmptyClick` needs
   *   them: it compares the press against the first/last row's live
   *   `getBoundingClientRect()`, which is viewport-relative too.
   * - `contentY` is the same press expressed in `contentRef`'s own box. The
   *   marquee rectangle is an absolutely-positioned CHILD of that box, so its
   *   `top` must be scroll-invariant. Subtracting a frozen viewport `y` from a
   *   content rect re-read every frame drifts the anchor by exactly the distance
   *   scrolled since the press — unnoticeable until the drag itself scrolls.
   */
  const dragStartRef = useRef<{
    id: string | null;
    x: number;
    y: number;
    contentY: number;
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
        if (
          fallback &&
          lastBlock.type === fallback.type &&
          textOf(lastBlock) === ""
        ) {
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
   * The ONE per-frame body of a drag-select gesture, at a viewport `clientY`.
   *
   * Two distinct clocks can advance a gesture, and both call this: the POINTER
   * moved (`pointermove`), or the SURFACE moved under a parked pointer
   * (`useEdgeAutoScroll`'s `onScroll`). The second is not a refinement — while
   * the user holds still at the edge it is the only thing driving the gesture,
   * so without re-applying here auto-scroll would move the document and select
   * nothing new.
   *
   * The mirror rule lives at the call sites: `track` is fed from the pointer
   * handler ONLY, never from in here, or the hook would re-latch off its own
   * callback.
   */
  const applySelectionAt = useEventCallback((clientY: number) => {
    const start = dragStartRef.current;
    if (!start) return;
    // `rowAtPointer` falls back to the NEAREST row when the pointer is off the
    // content, which is exactly what this wants: a pointer parked below the last
    // block resolves to the last row, so the range keeps extending as fresh
    // content scrolls in under it.
    const cur = rowAtPointer(clientY);

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
      //
      // Safe to run at 60fps — which is what an auto-scrolling gesture now does
      // — ONLY because `focusContainer` focuses with `preventScroll: true`
      // (`internal/use-block-selection.ts`). Drop that and focus yanks the
      // viewport back every frame, fighting the auto-scroll. (`focus()` on an
      // already-focused element is a no-op and `releaseCaret` early-returns with
      // no range, so the repeat itself costs nothing.)
      focusContainer();
      return;
    }

    const content = contentRef.current;
    if (content) {
      // Both ends in CONTENT coords, so the rectangle stays glued to the blocks
      // it depicts while the surface scrolls beneath the gesture. The drag
      // threshold is measured here too: a stationary pointer over a scrolling
      // surface is genuinely a drag, not a click.
      const curContentY = clientY - content.getBoundingClientRect().top;
      const top = Math.min(start.contentY, curContentY);
      const height = Math.abs(curContentY - start.contentY);
      if (height > 3) {
        dragMovedRef.current = true;
        setMarquee({ top, height });
      }
    }
    if (cur && start.id) applyRange(start.id, cur.id);
  });

  // Holding the pointer at the top/bottom edge scrolls the document and keeps
  // the selection extending, Notion-style. `containerRef` is the interaction
  // surface, which sits INSIDE whatever scroller hosts the editor — the hook
  // walks up from it to find that scroller per gesture.
  const autoScroll = useEdgeAutoScroll({
    anchorRef: containerRef,
    onScroll: applySelectionAt,
  });

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
      // The content wrapper renders inside the container in the same pass, so the
      // check above already proves it is mounted. Refusing to start the gesture is
      // still the honest response to its absence — the marquee's anchor is read
      // from this box, and there is no coordinate to guess it from.
      const content = contentRef.current;
      if (!content) return;

      const row = el.closest("[data-block-id]");
      const inText = isInsideEditingHost(el);
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

      dragStartRef.current = {
        id: originId,
        x: e.clientX,
        y: e.clientY,
        contentY: e.clientY - content.getBoundingClientRect().top,
        mode,
      };
      dragMovedRef.current = false;
      textDragPromotedRef.current = false;
      // A text press must reach the browser untouched — that IS the intra-block
      // selection. Only the background entry claims the editor up front.
      if (mode === "background") focusContainer();

      /**
       * Has the gesture become OURS? Auto-scroll must not engage on the press
       * itself: the editor's trailing `min-h-40` empty zone sits exactly inside
       * the bottom edge band on a full page, so a plain click there would scroll
       * under a stationary pointer, arm `dragMovedRef`, and swallow the
       * `onEmptyClick` that makes click-to-edit work at the bottom of a page.
       *
       * For `text` the promotion latch says the same thing: before the pointer
       * leaves the origin row the gesture belongs to the BROWSER (which does its
       * own selection auto-scroll), and the editor's rule is to never intercept
       * the text press on the way down.
       */
      const engaged = () =>
        mode === "text" ? textDragPromotedRef.current : dragMovedRef.current;

      const onMove = (ev: PointerEvent) => {
        applySelectionAt(ev.clientY);
        if (engaged()) autoScroll.track(ev.clientY);
      };
      const finish = (commitClick: boolean) => {
        // First: the gesture is over, so the loop must not survive whatever the
        // click branch below does (focus, insert, a re-render).
        autoScroll.stop();
        const start = dragStartRef.current;
        // A plain click (no drag) on the empty background routes the caret to a
        // block; a drag was a marquee selection and is left alone. A text press
        // needs neither — the browser already placed the caret. A CANCELLED
        // gesture is not a click at all, so it takes the teardown without this.
        if (
          commitClick &&
          start &&
          start.mode === "background" &&
          !dragMovedRef.current
        ) {
          onEmptyClick(start.x, start.y);
        }
        dragStartRef.current = null;
        textDragPromotedRef.current = false;
        setTextDragPromoted(false);
        setMarquee(null);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onCancel);
      };
      const onUp = () => finish(true);
      // Without this the gesture's listeners survive a cancelled press — inert
      // until now, but they hold an auto-scroll loop that would keep scrolling
      // the document with no pointer left to end it.
      const onCancel = () => finish(false);
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onCancel);
    },
    [applySelectionAt, autoScroll, focusContainer, onEmptyClick, containerRef],
  );

  // ---- Drag-and-drop (single block, or the whole selection) ----------------

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  // External (OS / cross-app) drag state, kept separate from the dnd-kit
  // block-reorder drag above: native HTML drag events never overlap dnd-kit's
  // pointer-based reorder, so the two can't be active at once. `externalDragging`
  // holds WHAT is being dragged rather than a bare boolean, so the scrim can say
  // what it will do with it.
  const [externalDropTarget, setExternalDropTarget] =
    useState<DropTarget | null>(null);
  const [externalDragging, setExternalDragging] = useState<ClaimedKind | null>(
    null,
  );
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
      // Dragging a block that is NOT in the live selection ends that selection
      // (Notion's model) — otherwise a stale highlight would sit over blocks the
      // gesture never touched. This used to be a side effect of the rail button
      // stealing focus on mousedown; `RailButton` now suppresses that (it is what
      // makes the bulk arm above reachable at all), so the clear has to be said.
      setBulkDragState(null);
      clearSelection();
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
  const externalDropPosition = useCallback(
    (
      target: DropTarget | null,
    ): { afterId: string | null; parentId: string | null } => {
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
      return {
        afterId: siblings[idx - 1]?.id ?? null,
        parentId: targetRow.parentId,
      };
    },
    [],
  );

  const onExternalDragOver = useCallback(
    (e: React.DragEvent) => {
      // A dragover's DataTransfer is in PROTECTED mode (types readable,
      // `getData()` empty), so this decision comes from the types alone — see
      // `internal/drag-kind.ts` for what that costs.
      const kind = dragKindFromTypes(e.dataTransfer.types);
      if (kind === "none") return;
      // No blob storage in the in-memory (non-persisting) mode, so a dropped file
      // must never reach an upload: refuse the drag entirely.
      if (kind === "files" && !allowAttachments) return;
      // A single line of TEXT belongs at the caret, and only the native drop can
      // put it there — so a text drag over a block's editing host is left to the
      // browser. We cannot yet tell single- from multi-line (protected mode),
      // but the contenteditable makes the drop fire regardless, and
      // `onExternalDrop` claims it then if it turns out to carry newlines.
      if (kind === "text" && isInsideEditingHost(e.target)) {
        // Declining also means dropping our own affordance: this is the one
        // branch that can flip mid-drag (the pointer crossing from the page's
        // whitespace into a block's text), so the scrim and the insertion line
        // would otherwise linger over territory we no longer claim.
        setExternalDragging(null);
        setExternalDropTarget(null);
        return;
      }
      e.preventDefault(); // required so the drop event fires
      e.dataTransfer.dropEffect = "copy";
      setExternalDragging(kind);
      const next = rowAtPointer(e.clientY);
      setExternalDropTarget((prev) =>
        prev?.id === next?.id && prev?.zone === next?.zone ? prev : next,
      );
    },
    [allowAttachments],
  );

  const onExternalDragLeave = useCallback(
    (e: React.DragEvent) => {
      // dragleave fires when crossing into a child too; only clear when the pointer
      // has actually left the container's subtree.
      if (containerRef.current?.contains(e.relatedTarget as Node | null))
        return;
      setExternalDragging(null);
      setExternalDropTarget(null);
    },
    [containerRef],
  );

  /**
   * The container owns the pointer DROP, as the blocks own the caret PASTE.
   *
   * A drop has a pointer position, and where a pointer position lands is
   * container knowledge (`rowAtPointer`, `externalDropPosition`, the per-row
   * insertion line, the full-surface scrim) — so there is no per-block
   * `DROP_COMMAND` handler for the forest/markdown cases, which would
   * double-handle with this one.
   *
   * Claiming the drop is also the ONLY way to stop what the browser would do
   * next: an unprevented drop fires `beforeinput` with `inputType:
   * "insertFromDrop"`, which Lexical turns into a controlled text insertion
   * whose plain-text arm calls `selection.insertParagraph()` per newline and
   * dispatches NO command — leaving the block's root holding several paragraphs,
   * the one state every caret/split/merge rule here is written against.
   * `preventDefault` on the drop cancels that default action outright.
   */
  const onExternalDrop = useCallback(
    (e: React.DragEvent) => {
      const dt = e.dataTransfer;
      const kind = dragKindFromTypes(dt.types);
      if (kind === "none") return;
      // Read everything off the event SYNCHRONOUSLY — the FileList and the
      // pointer position are both cleared once this handler returns, before the
      // async uploads below run.
      //
      // A drop makes ONE block per dropped file (unlike the paste, which takes
      // the single best clipboard item), so the resolved picks are also the
      // `isFile` predicate below: the classifier and the handler read the same
      // list, and there is no branch where one says "file" and the other has
      // nothing to do. In-memory mode has no server to store a blob, so it
      // resolves none and a dropped file never reaches an upload.
      const picks = allowAttachments
        ? Array.from(dt.files)
            .map((file) => ({
              file,
              handler: resolveBlockPasteHandler(file.type),
            }))
            .filter(
              (p): p is { file: File; handler: BlockPasteHandler } =>
                p.handler !== null,
            )
        : [];
      // The SAME classification the container paste runs, differing only in
      // where the insertion point comes from: a caret for a paste, the drop's
      // own target for this.
      const decision = decideTransfer({
        isFile: picks.length > 0,
        blocksJson: dt.getData(BLOCKS_MIME),
        text: readTransferText(dt),
        inline: isInsideEditingHost(e.target),
      });
      const pos = externalDropPosition(rowAtPointer(e.clientY));
      setExternalDragging(null);
      setExternalDropTarget(null);

      // A single line landing inside a block's text: the native caret drop owns
      // it, exactly as the native caret paste owns its equivalent.
      if (decision.kind === "inline") return;

      if (decision.kind === "file") {
        e.preventDefault();
        // Each file becomes its matching attachment block via the generic
        // registry, so image/video/audio/file participate with no per-type code
        // here.
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
        return;
      }

      let forest: SerializedBlock[];
      if (decision.kind === "forest") {
        try {
          forest = JSON.parse(decision.json) as SerializedBlock[];
        } catch (err) {
          // Mirror the paste handlers' tolerance: a malformed payload is not our
          // drop — leave the browser's default alone.
          if (!(err instanceof SyntaxError)) throw err;
          return;
        }
      } else {
        forest = parseMarkdownToForest(decision.text, {
          handles,
          protectedSpans: blockTextProtectedSpans(),
        });
      }
      // Empty/unparseable forest (a whitespace-only payload) → never swallow the
      // event for nothing.
      if (!Array.isArray(forest) || forest.length === 0) return;
      e.preventDefault();
      paste({ blocks: forest, ...pos });
    },
    [externalDropPosition, paste, handles, allowAttachments],
  );

  // The reorder drag and the file drag are mutually exclusive, so one indicator
  // source feeds the per-row insertion line.
  const activeDropTarget = dropTarget ?? externalDropTarget;

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

  // Every row's RAIL SEAT — where its hover controls sit, WHICH BLOCK they act
  // on, and (for a container anchor) the first-line center it borrows from its
  // first child. Resolved HERE and nowhere else, because none of the three is
  // knowable from a row alone: the geometry needs the frame spans
  // (`internal/page-column.ts`) and the ownership needs the borrow chain above
  // the row. One resolved seat per row is also what lets `<BlockRail>` take the
  // seat and nothing else — see `internal/rail-seat.ts`.
  const handleOf = useCallback(
    (type: string) => handleMap.get(type),
    [handleMap],
  );
  const railSeats = useMemo(
    () => resolveRailSeats(flat, frameSpans, handleOf),
    [flat, frameSpans, handleOf],
  );

  // The selection highlight, as runs of consecutive selected LINES rather than
  // one box per row — see `internal/selection-bands.ts` for why that is the
  // shape, and `components/selection-bands.tsx` for the look.
  const selectionBands = useMemo(
    () => resolveSelectionBands(flat, frameSpans, selectedIds),
    [flat, frameSpans, selectedIds],
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
            // The whole block list delegates undo to the TAB's stack: there is
            // no per-block Lexical `HistoryPlugin`, so ⌘Z with the caret in a
            // block must drive that stack rather than the caret's own editing
            // host. Every other editable on screen (the page title input, the
            // agent prompt) keeps its own history and is left alone, which is
            // exactly what this marker delimits.
            {...surfaceUndoProps}
            // A NAMED GROUP, and nothing more specific — because nothing more
            // specific would be true. Every row here holds a `contenteditable`
            // editing host, so the rows are not options, and no composite role
            // (listbox, tree, grid) can honestly describe them.
            //
            // This used to say `role="listbox" aria-multiselectable`, which was
            // worse than no role at all: a listbox promises options, so it both
            // announced an empty list AND hid the document's own structure — the
            // headings, lists and quotes that are the whole point of the page.
            // Selection is spoken instead (see `use-block-selection.ts`) and each
            // selected row says "Selected." in `sr-only` text. Do not re-add
            // `role="option"`: see this plugin's `CLAUDE.md`, *The block list is a
            // document, not a listbox*.
            {...BLOCK_LIST_ARIA}
            onKeyDown={onKeyDown}
            onCopy={onCopy}
            onCut={onCut}
            onPaste={onPaste}
            onPointerDown={onPointerDown}
            onDragOver={onExternalDragOver}
            onDragLeave={onExternalDragLeave}
            onDrop={onExternalDrop}
            onFocusCapture={onFocusCapture}
            // Full-surface drop scrim painted above the blocks (a
            // pointer-events-none `above` layer, so it never eats the drag
            // events). The per-row insertion line below still pinpoints the drop.
            above={<ExternalDropOverlay kind={externalDragging} />}
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
                  span (equal stacking level → document order decides). */}
              {frameSpans.map((span) => (
                <div
                  key={`frame:${span.block.id}`}
                  // eslint-disable-next-line layout/no-adhoc-layout -- grid-row span placement is the point of this element; `relative` gives the frame a positioned box to paint into
                  className="pointer-events-none relative col-start-1"
                  style={{ gridRow: `${span.start + 1} / ${span.end + 2}` }}
                >
                  <Editor.BlockFrame.Dispatch
                    type={span.block.type}
                    data={span.block.data}
                    blockId={span.block.id}
                    inset={blockContentLeft(span.depth)}
                  />
                </div>
              ))}
              {/* The block-selection highlight, over the frames and under the
                  rows. It is resolved here — with the whole flatten in view —
                  rather than per row, because "is the line above me selected
                  too" is not knowable from a row alone, and it is the answer to
                  that question that turns N selected blocks into ONE highlighted
                  passage. A selected CONTAINER needs no special case either: it
                  paints over its frame span, which is what covers a zero-height
                  anchor row's box. */}
              <SelectionBands bands={selectionBands} />
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
                    hasVisibleChildren={f.firstVisibleChildType !== null}
                    ordinal={f.ordinal}
                    seat={railSeats[i]!}
                    isSelected={selectedIds.has(f.block.id)}
                    isDragging={
                      activeId === f.block.id ||
                      (bulkDrag?.subtree.has(f.block.id) ?? false)
                    }
                    dropZone={
                      activeDropTarget?.id === f.block.id
                        ? activeDropTarget.zone
                        : null
                    }
                  />
                </div>
              ))}
              {marquee && (
                <div
                  // The lasso is drawn OVER the blocks it is sweeping, so its
                  // fill stays fainter than the selection band underneath it —
                  // it reads as the gesture, not as a second highlight.
                  // eslint-disable-next-line layout/no-adhoc-layout -- marquee rectangle positioned via JS-computed top/height coords (inset-x-2 insets its sides within the content box); not a ramp-expressible anchor
                  className="bg-primary/5 border-primary/25 pointer-events-none absolute inset-x-2 z-base rounded-sm border"
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
