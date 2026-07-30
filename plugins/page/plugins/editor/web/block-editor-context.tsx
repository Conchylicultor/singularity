import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react";
import { useLatestRef } from "@plugins/primitives/plugins/latest-ref/web";
import { useScopedUndoRedo } from "@plugins/primitives/plugins/undo-redo/web";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import {
  computeDrop,
  selectionRoots,
  subtreeIds,
} from "@plugins/primitives/plugins/tree/core";
import {
  prevVisibleLine,
  nextVisibleLine,
  runsOfNode,
  runsLength,
  applyBlockOp,
  applyBulkMove,
  childrenOf,
  diffBlocks,
  inDocumentOrder,
  planBulkMove,
  patchesFromDiff,
  isEmptyPatch,
  withMintedIds,
  namesField,
  type Block,
  type BlockOp,
  type BlockPatch,
  type RichText,
  type RowData,
  type SerializedBlock,
} from "../core";
import {
  appendRunsToBlockDoc,
  captureBlockDocEdit,
  truncateBlockDocFrom,
  type CapturedBlockDocEdit,
} from "./internal/use-collab-block-doc";
import {
  buildOverlayOp,
  buildPatchOverlayOp,
  toNodes,
  fromNodes,
} from "./internal/optimistic-block-ops";
import { serializeForest } from "./serialize-blocks";
import { landCaret } from "./internal/caret-landing";
import type { CaretLandOptions, CaretSurface, CaretSurfaceRef } from "./caret-surface";
import { useAnchorTypes, useBlockHandles } from "./internal/block-handles";
import { useMemoryBlockStore, type BlockStore } from "./block-store";
import { CompositeServerProviderHost } from "./composite-block-store";
import { Editor } from "./slots";
import type { BlockEditorAPI } from "./types";

/** Human labels for the structural-undo history (tooltips / menus). */
const OP_LABELS: Record<BlockOp["kind"], string> = {
  insert: "Insert block",
  delete: "Delete block",
  split: "Split block",
  merge: "Merge blocks",
  indent: "Indent blocks",
  outdent: "Outdent blocks",
  unwrap: "Remove container",
  move: "Move block",
  paste: "Paste blocks",
  duplicate: "Duplicate blocks",
};

/**
 * The block id the user is "on" for an op, used to restore focus on undo/redo.
 * Takes the PRE-op rows because some ops focus a block they do not name.
 */
function opFocusId(op: BlockOp, before: Block[]): string | null {
  switch (op.kind) {
    case "insert":
    case "split":
      return op.newId;
    case "merge":
    case "delete":
    case "move":
      return op.blockId;
    case "unwrap":
      // The container VANISHES, so focusing `op.blockId` would land focus on a
      // row that no longer exists (i.e. on <body>). The caret belongs on the
      // first promoted child — the line the user was standing on when Backspace
      // dissolved the box, and the row that now occupies the container's slot.
      return childrenOf(toNodes(before), op.blockId)[0]?.id ?? null;
    case "indent":
    case "outdent":
      // A bulk indent/outdent is driven from block-SELECTION mode, where focus
      // lives on the selection container, not in any block's editor. Undo/redo
      // then falls back to the patch's own first upsert.
      return op.blockIds.length === 1 ? (op.blockIds[0] ?? null) : null;
    case "paste":
    // A duplicate is paste's shape exactly: clones land after their sources and
    // focus stays on the selection container. (Selecting the clones is a
    // deliberate non-goal — see the plan's follow-ups.)
    case "duplicate":
      // A paste never moves the caret — it lands blocks after the anchor and
      // leaves focus where it was (in the anchor block, or on the selection
      // container). There is no "block the user is on" to restore.
      return null;
  }
}

/** Run the pure reducer over full rows and project back to `Block[]`. */
function fromOpResult(
  before: Block[],
  op: BlockOp,
  anchorTypes: ReadonlySet<string>,
): Block[] {
  return fromNodes(applyBlockOp(toNodes(before), op, { anchorTypes }), before);
}

/**
 * Shared before→after derivation for the two structural recorders
 * (`recordPatchEntry` and `recordStructuralWithDocEdit`): diff the two full-row
 * snapshots into a minimal forward/reverse `BlockPatch` pair, splice the optional
 * `undoTextOverride` into the reverse patch (no-op when undefined — pins a
 * restored row's `data.text` to LIVE runs captured at op time, used by merge),
 * and derive the per-direction focus targets. Returns `null` when BOTH patches are
 * empty; the caller decides whether that is a full bail (patch-only entry) or a
 * still-record (a docEdit-only entry). Redo keeps the `focusId` the user was on;
 * undo PREFERS the block the reverse patch restores over `focusId` — undoing a
 * split deletes the new block, so landing focus on it would drop focus to <body>,
 * whereas the reverse write's target is the surviving block — falling back to
 * `focusId` then the forward patch so every op still lands somewhere sane.
 */
function derivePatchEntry(
  before: Block[],
  after: Block[],
  focusId: string | null,
  undoTextOverride?: { blockId: string; runs: RichText },
): {
  undoPatch: BlockPatch;
  redoPatch: BlockPatch;
  undoFocus: string | null;
  redoFocus: string | null;
} | null {
  const patches = patchesFromDiff(diffBlocks(before, after));
  const redoPatch = patches.redo;
  let undoPatch = patches.undo;
  if (undoTextOverride) {
    const { blockId, runs } = undoTextOverride;
    const pin = (data: unknown) => ({
      ...((data as Record<string, unknown> | null) ?? {}),
      text: runs,
    });
    // Only where the reverse patch ALREADY writes `data`. A create restores the
    // whole row, so it always does; an update that says nothing about `data`
    // must keep saying nothing — pinning text there would turn a field-scoped
    // write back into an authority claim over a field it doesn't own. (In
    // practice merge's source row was deleted, so it is a create.)
    undoPatch = {
      ...undoPatch,
      creates: undoPatch.creates.map((b) =>
        b.id === blockId ? { ...b, data: pin(b.data) } : b,
      ),
      updates: undoPatch.updates.map((u) =>
        u.id === blockId && namesField(u.changes, "data")
          ? { ...u, changes: { ...u.changes, data: pin(u.changes.data) } }
          : u,
      ),
    };
  }
  if (isEmptyPatch(undoPatch) && isEmptyPatch(redoPatch)) return null;
  // Order mirrors the patch's own precedence: redo's first write is its creates
  // (a split's new block), undo's is its updates (the surviving origin row).
  const redoFocus = focusId ?? redoPatch.creates[0]?.id ?? redoPatch.updates[0]?.id ?? null;
  const undoFocus =
    undoPatch.updates[0]?.id ?? undoPatch.creates[0]?.id ?? focusId ?? null;
  return { undoPatch, redoPatch, undoFocus, redoFocus };
}

/**
 * A block's focus capabilities, registered by its renderer. It is the block-side
 * `CaretSurface`: every focusable block provides `focus`; text editors
 * additionally provide caret-precise placement so the coordinator can land the
 * caret at a pixel column or boundary. Void/textarea blocks (divider, code)
 * register `focus` only. On top of the surface contract, a bound text editor
 * exposes content surgery (`truncateAt` / `appendRunsAtEnd`), which only a block
 * bound to a content doc can implement.
 */
export interface BlockFocusHandle extends CaretSurface {
  /** Place the caret at a linear character offset (the merge join point). */
  focusOffset?: (offset: number, opts?: CaretLandOptions) => void;
  /**
   * Content surgery (registered by text editors, whose Lexical instance is
   * bound to the block's per-block content doc): delete the LIVE content from
   * linear `offset` to the end. Enter-split uses it to leave the head in the
   * origin block — the reducer's row-level truncation is ignored by a bound
   * editor.
   */
  truncateAt?: (offset: number) => void;
  /**
   * Content surgery: append `runs` to the LIVE content's end, focus, and land
   * the caret at the join offset. Backspace-merge drives the target block's
   * editor with it (through Lexical, so the collab binding syncs the
   * concatenation into the target's content doc with marks/tokens intact).
   */
  appendRunsAtEnd?: (runs: RichText) => void;
  /**
   * Content surgery: delete the LIVE content in the linear range `[from, to)`.
   * The non-tail sibling of `truncateAt` — a slash-menu commit strips its
   * `/query`, a markdown shortcut its `> ` prefix — and the ONLY way to strip
   * text a type change consumed, since `page_blocks.data.text` is a projection
   * of the doc this edits, not a place text can be removed from.
   */
  deleteRange?: (from: number, to: number) => void;
  /** Serialize this block's LIVE runs (the read dual of `appendRunsAtEnd`). */
  readRuns?: () => RichText;
}

/**
 * The ONE place in the row-write pipeline permitted to name `text`.
 *
 * A row write states the fields it owns; `text` is not one of them — it is a
 * ~1 s-debounced projection of the block's content doc, whose sole writer is
 * `projectText`. A type change keeps the block's id, hence its doc, hence its
 * text, so `convertTo`/`update` carry the row's existing projection across
 * untouched rather than restating (or dropping) it. Everywhere else the key is
 * unrepresentable — that is what {@link RowData} buys.
 *
 * `targetAcceptsText` is the one case where the projection must NOT survive: a
 * conversion into a text-less type (divider, image, …) whose strict schema
 * rejects a stray `text` key at the write boundary with a 400.
 */
function preserveText(
  prev: unknown,
  next: RowData,
  targetAcceptsText: boolean,
): Record<string, unknown> {
  const text = (prev as Record<string, unknown> | null)?.text;
  if (!targetAcceptsText || text === undefined) return { ...next };
  return { ...next, text };
}

interface BlockEditorContextValue {
  pageId: string;
  /** Server truth with all pending structural ops replayed optimistically. */
  blocks: Block[];
  /**
   * Block ids present in AUTHORITATIVE server truth — the raw resource base,
   * with NO optimistic overlay. A freshly created / split block appears in
   * `blocks` immediately but only lands here once the server has really
   * committed its row. Consumers that must wait for the row to be
   * FK-satisfyingly real (the content-doc seed, Stage 4a) gate on this set.
   */
  serverIds: ReadonlySet<string>;
  /** True until the first authoritative blocks snapshot arrives. */
  pending: boolean;
  /**
   * Optional allowlist of insertable block `type`s. When set, block-type pickers
   * (add-block menu, gutter `+`, slash menu) offer only these types. Undefined
   * (the default) offers every registered block type.
   */
  enabledBlockTypes?: readonly string[];
  /**
   * Whether attachment (file drop / paste-file) affordances are active. False in
   * the in-memory (non-persisting) mode, where there is no server to store an
   * uploaded blob.
   */
  allowAttachments: boolean;
  /**
   * Whether this editor's per-block content docs SYNC to the server (the CRDT
   * transport: `blockContentResource` subscription + `doc-init`/`doc-update`).
   * True on the persistent path; false in the in-memory mode, where each block's
   * `Y.Doc` is purely local (seeded from `data.text`, never networked). Read by
   * `CollabTextPlugin` to pick the server vs local content-doc hook.
   */
  serverSync: boolean;
  focusedBlockId: string | null;
  setFocusedBlockId: (id: string | null) => void;
  registerFocusHandle: (id: string, handle: BlockFocusHandle) => () => void;
  makeBlockAPI: (blockId: string) => BlockEditorAPI;
  /**
   * "Strip then convert" — THE single primitive behind every commit that
   * consumes some of a block's own text as a command: the slash menu's
   * `/query`, the gutter-`+` draft's filter, a markdown prefix (`* `, `> `,
   * `# `). One operation, two owners, in this order:
   *
   *  1. delete `[from, to)` from the block's CONTENT DOC through its focus
   *     handle (discrete, so it lands before anything can re-render);
   *  2. write the new `type` to the ROW.
   *
   * The order is the whole point. Text lives in the doc; `data.text` is a
   * projection of it. A convert that carried the stripped text in its row
   * payload could not strip anything — it would leave the doc saying
   * `/callout` while the row said `text: []`, permanently. And a type change
   * that swaps the block's renderer unmounts the very editor holding the doc
   * binding, so a strip deferred past it never happens at all.
   */
  convertStrippingText: (args: {
    blockId: string;
    /** Linear start of the consumed span (stored-runs basis), inclusive. */
    from: number;
    /** Linear end of the consumed span, exclusive. `to <= from` strips nothing. */
    to: number;
    type: string;
    /** Target payload, seeded from the target handle's `emptyRowData()`. */
    data: RowData;
    /** Reset the open/collapsed state in the same write (a toggle opens). */
    expanded?: boolean;
  }) => void;
  setFlatOrder: (blocks: Block[]) => void;
  /** All blocks of the page (incl. collapsed), kept current for bulk ops. */
  setRows: (blocks: Block[]) => void;
  rowsRef: MutableRefObject<Block[]>;
  /**
   * Focus a block's text editor by id (defers until it mounts if needed). When
   * `caretOffset` is given and the block's editor is already mounted, land the
   * caret at that linear offset (used to restore the caret on a text undo/redo).
   * `opts.scroll` (default false) declares whether the landing follows the caret
   * into view — set for keyboard nav / undo-redo, left off for pointer landings.
   */
  focusBlock: (id: string, caretOffset?: number, opts?: CaretLandOptions) => void;
  focusBlockBoundary: (id: string, edge: "start" | "end", opts?: CaretLandOptions) => boolean;
  /**
   * Reorder/reparent `id` to sit immediately `zone` of `targetId`. Positional
   * intent, not a rank — the store owns the rank (the server mints it on the
   * persistent path; the memory store mints its own). See `BlockMoveDest`.
   */
  move: (id: string, zone: "before" | "after", targetId: string) => void;
  /**
   * Nest each of `blockIds` under its previous sibling — the selection-mode Tab.
   * The set moves as one rigid body: a block that cannot indent holds the rest of
   * its run in place rather than swallowing it (see `foldIndent`). A no-op is
   * dropped before it reaches the undo stack or the network.
   */
  indentBlocks: (blockIds: string[]) => void;
  /** Lift each of `blockIds` out to its parent's level — the selection-mode Shift+Tab. */
  outdentBlocks: (blockIds: string[]) => void;
  /**
   * Dissolve the CONTAINER `blockId`: delete it and promote its children into the
   * slot it occupied, order preserved. How the caret escapes a container box —
   * Backspace at the start of an anchor's first child resolves here, and a
   * container's own chrome (the callout icon menu's "Remove callout") uses the
   * same entry point.
   *
   * Takes a block id because the caller is usually standing in a DIFFERENT block
   * (the anchor renders no line and holds no caret), which is also why it lives
   * on the context rather than on a single block's `BlockEditorAPI`.
   */
  unwrapBlock: (blockId: string) => void;
  /** Bulk operations on a set of selected block ids (see server endpoints). */
  bulkDelete: (ids: string[]) => void;
  bulkMove: (args: {
    ids: string[];
    parentId: string | null;
    afterId: string | null;
  }) => void;
  /**
   * Clone each selection root's subtree in place, immediately after its source.
   * A `duplicate` `BlockOp` dispatched through `dispatchOp`, so it is optimistic
   * and recorded as ONE undo entry like every other structural edit.
   *
   * Returns nothing, for `paste`'s reason: the minted root ids are right there
   * in the op, but `dispatchOp` legitimately DROPS an op whose reducer diff is
   * empty, so "the ids that were created" would be an absorbable failure — a
   * caller reading them back would be told clones landed in exactly the case
   * they did not.
   */
  bulkDuplicate: (ids: string[]) => void;
  /**
   * Insert a serialized forest after `afterId` (or, anchorless, at the start of
   * `parentId` — defaulting to the page's own top level). A plain `BlockOp`
   * dispatched through `dispatchOp`, so it is optimistic and recorded as ONE
   * undo entry like every other structural edit.
   *
   * Returns nothing, deliberately. The minted root ids are right there in
   * `withMintedIds`' output, but `dispatchOp` legitimately DROPS an op the
   * reducer refused (a missing anchor refuses the whole paste), so "the ids
   * that were pasted" would be an absorbable failure — a caller reading them
   * back would be told content landed in exactly the case it did not.
   */
  paste: (args: {
    blocks: SerializedBlock[];
    afterId: string | null;
    parentId?: string | null;
  }) => void;
  /**
   * Create a block of the given type at the end of the page and focus it
   * once the live resource re-renders the list.
   */
  insert: (type: string, data: unknown) => void;
  /**
   * Create a block of the given type at the TOP of the page and focus it —
   * prepended before the current first top-level block (or appended when the
   * page has no content yet). Drives the page title's Enter affordance.
   */
  insertFirst: (type: string, data: unknown) => void;
  /**
   * Projection writer: persist the content doc's current runs to `data.text`
   * WITHOUT recording on the undo stack (Yjs owns text history). Keeps row
   * readers — search, backlinks, history snapshots, read-only views — fresh.
   * No-ops when the block row no longer exists.
   */
  projectText: (blockId: string, runs: RichText) => void;
  /**
   * Text-history recorder: mirror ONE captured `Y.UndoManager` item (a
   * coalesced typing run in `blockId`'s content doc) onto the unified undo
   * stack. Called by `CollabTextPlugin` from the content-doc seam's
   * `onUndoableEdit`.
   *
   * `label` defaults to the typing-run label ("Edit text"); a caller that
   * captured a NON-typing content-doc edit (see {@link recordDocEdit}) names
   * what it actually did, so the history reads truthfully.
   */
  recordTextEdit: (blockId: string, edit: CapturedBlockDocEdit, label?: string) => void;
  /**
   * Capture a SYNCHRONOUS content-doc edit as ONE standalone text undo entry.
   * `edit` must drive its Lexical/Yjs changes synchronously (`discrete: true`) —
   * see `captureBlockDocEdit`. No-ops when the edit changed nothing.
   *
   * It lives here rather than in the calling component so that ALL undo
   * recording stays at this documented chokepoint, next to
   * `recordStructuralWithDocEdit`, instead of a component reaching into
   * `captureBlockDocEdit` itself — and it hands the same capability to any
   * future "toolbar bold as its own undo step".
   */
  recordDocEdit: (blockId: string, label: string, edit: () => void) => void;
  /** Structural (document-tier) undo — reverses the last recorded block edit. */
  undo: () => void;
  /** Structural (document-tier) redo — re-applies the last undone block edit. */
  redo: () => void;
  /** Whether there is a recorded structural edit to undo. */
  canUndo: boolean;
  /** Whether there is an undone structural edit to redo. */
  canRedo: boolean;
  /**
   * The block id whose gutter-`+` draft menu is currently open, or null. The
   * gutter `+` inserts an empty paragraph, focuses it, and flags it here; that
   * block's `BlockMenuPlugin` force-opens the shared caret menu inline-filtered
   * by the block's own text. Doubles as the placeholder trigger ("Type to
   * filter" while the draft menu is open).
   */
  blockMenuDraftId: string | null;
  /** Open the gutter-`+` draft menu on `id` (set after inserting the block). */
  requestBlockMenu: (id: string) => void;
  /** Clear the draft menu — unconditionally, or only if it is still on `id`. */
  clearBlockMenu: (id?: string) => void;
  /**
   * Optional navigation callback so link/mention block renderers can open a
   * page without hardcoding any host app's pane. Undefined when the host did
   * not provide one.
   */
  onOpenPage?: (pageId: string) => void;
}

const BlockEditorContext = createContext<BlockEditorContextValue | null>(null);

export function useBlockEditor(): BlockEditorContextValue {
  const ctx = useContext(BlockEditorContext);
  if (!ctx) throw new Error("useBlockEditor must be used within a BlockEditorProvider");
  return ctx;
}

/**
 * The insertable-type allowlist of the nearest `BlockEditorProvider`, or
 * undefined outside one / when unrestricted. Read by `useInsertableBlocks` so the
 * palette filter applies to every block-type picker with no per-menu wiring.
 */
export function useEnabledBlockTypes(): readonly string[] | undefined {
  return useContext(BlockEditorContext)?.enabledBlockTypes;
}

/**
 * Props shared by both provider modes. `persist` picks the store: the default
 * (persistent) reads/writes `blocksResource` + the server endpoints; `false`
 * runs a self-contained in-memory document seeded from `initialBlocks` (no
 * network, no DB rows).
 */
type BlockEditorProviderProps = {
  onOpenPage?: (pageId: string) => void;
  /** Optional allowlist of insertable block types (see the context field). */
  enabledBlockTypes?: readonly string[];
  /** See `BlockEditor`'s props — the caret surfaces flanking the block list. */
  caretBefore?: CaretSurfaceRef;
  caretAfter?: CaretSurfaceRef;
  children: ReactNode;
} & (
  | { persist?: true; pageId: string }
  | { persist: false; pageId: string; initialBlocks: Block[] }
);

export function BlockEditorProvider(props: BlockEditorProviderProps) {
  // `persist` is fixed for a mounted editor, so switching component by it is not
  // a hooks-order hazard — each host calls exactly one store hook.
  if (props.persist === false) {
    return (
      <MemoryProviderHost
        pageId={props.pageId}
        initialBlocks={props.initialBlocks}
        enabledBlockTypes={props.enabledBlockTypes}
        onOpenPage={props.onOpenPage}
        caretBefore={props.caretBefore}
        caretAfter={props.caretAfter}
      >
        {props.children}
      </MemoryProviderHost>
    );
  }
  // The server path is the COMPOSITE host (composite-block-store.tsx): one
  // feed per expanded nested page, composed into a single union store. With no
  // expansion it degenerates to exactly the old single-feed ServerProviderHost.
  return (
    <CompositeServerProviderHost
      pageId={props.pageId}
      enabledBlockTypes={props.enabledBlockTypes}
      onOpenPage={props.onOpenPage}
      caretBefore={props.caretBefore}
      caretAfter={props.caretAfter}
    >
      {props.children}
    </CompositeServerProviderHost>
  );
}

/** The flanking caret surfaces are storage-agnostic — both hosts thread them. */
interface ProviderHostCaretProps {
  caretBefore?: CaretSurfaceRef;
  caretAfter?: CaretSurfaceRef;
}

function MemoryProviderHost({
  pageId,
  initialBlocks,
  enabledBlockTypes,
  onOpenPage,
  caretBefore,
  caretAfter,
  children,
}: {
  pageId: string;
  initialBlocks: Block[];
  enabledBlockTypes?: readonly string[];
  onOpenPage?: (pageId: string) => void;
  children: ReactNode;
} & ProviderHostCaretProps) {
  const store = useMemoryBlockStore({ initialBlocks });
  return (
    <BlockEditorProviderInner
      store={store}
      pageId={pageId}
      serverSync={false}
      enabledBlockTypes={enabledBlockTypes}
      onOpenPage={onOpenPage}
      caretBefore={caretBefore}
      caretAfter={caretAfter}
    >
      {children}
    </BlockEditorProviderInner>
  );
}

// Exported for the provider hosts only (the composite server host lives in
// composite-block-store.tsx); apps never mount it directly — use
// `BlockEditorProvider`.
export function BlockEditorProviderInner({
  store,
  pageId,
  serverSync,
  enabledBlockTypes,
  onOpenPage,
  caretBefore,
  caretAfter,
  children,
}: {
  store: BlockStore;
  pageId: string;
  /**
   * Persistence mode: server-backed (true) vs in-memory (false). The single
   * source for both derived affordances — `allowAttachments` (no blob storage
   * without a server) and content-doc `serverSync` (no CRDT transport in
   * memory) are both `serverSync` on the context.
   */
  serverSync: boolean;
  enabledBlockTypes?: readonly string[];
  onOpenPage?: (pageId: string) => void;
  /** See `BlockEditor`'s props — the caret surfaces flanking the block list. */
  caretBefore?: CaretSurfaceRef;
  caretAfter?: CaretSurfaceRef;
  children: ReactNode;
}) {
  const [focusedBlockId, setFocusedBlockId] = useState<string | null>(null);
  const [blockMenuDraftId, setBlockMenuDraftId] = useState<string | null>(null);
  // Block-type facts the pure reducer and `convertTo` cannot derive from the
  // forest: which types are container anchors (the reducer's `BlockOpContext` —
  // the store passes the SAME set, and so does the server) and the handle
  // registry `convertTo` reads `wrapOnConvert`/`empty()` off.
  const anchorTypes = useAnchorTypes();
  const blockHandles = useBlockHandles();
  const focusHandlesRef = useRef(new Map<string, BlockFocusHandle>());

  // `type ⇒ does this type carry text`, read generically off the dispatch slot
  // (never a hardcoded list). The row-write pipeline is the one place that must
  // know: `preserveText` carries the projection across a conversion, EXCEPT into
  // a text-less type whose schema rejects the key. Resolving it here rather than
  // at each call site is what lets `convertTo` callers stop hand-branching on
  // `acceptsText`. An unregistered type is assumed text-bearing — the same
  // "trust the intent, let the write boundary reject loudly" stance the keyboard
  // ladder takes.
  const blockContributions = Editor.Block.useContributions();
  const acceptsTextRef = useLatestRef((type: string) => {
    const handle = blockContributions.find((c) => c.block.type === type)?.block;
    return handle ? handle.acceptsText : true;
  });
  // The flanking surfaces are read only inside imperative callbacks, so mirror
  // them into refs rather than threading them through `makeBlockAPI`'s deps.
  const caretBeforeRef = useLatestRef(caretBefore);
  const caretAfterRef = useLatestRef(caretAfter);
  const flatOrderRef = useRef<Block[]>([]);
  const rowsRef = useRef<Block[]>([]);
  // A queued focus carries its scroll intent so the deferred landing (fired by
  // `registerFocusHandle` when the block finally mounts) honors the same
  // scroll/no-scroll choice the caller made — a `focusNew` reveals its block, a
  // pointer `focusBlock` does not.
  const pendingFocusRef = useRef<{ id: string; scroll: boolean } | null>(null);

  // The persistence seam. All reads (`data`/`serverData`/`pending`) and writes
  // (`dispatch`/`move`/`bulk*`) go through it; everything else in this
  // provider (recording, focus, `makeBlockAPI`, the CRDT projection) is
  // storage-agnostic — the server and in-memory stores share ONE shape.

  // Render-fresh view of the current rows. `rowsRef` (set by a consumer
  // EFFECT) lags within a commit: when a structural patch removes a block, the
  // removed block's unmount cleanups run BEFORE the effect that refreshes
  // `rowsRef` — so existence checks against `rowsRef` in unmount paths see the
  // deleted row as still alive. `useLatestRef` writes during the provider's
  // render, which precedes those unmount cleanups in the same commit.
  const liveRowsRef = useLatestRef(store.data);

  // Ids the SERVER has committed (see the interface doc) — recomputed on each
  // authoritative push, so the "row is now real" edge (the doc-init FK gate)
  // propagates push-based. In memory the store's `serverData` is every row, so
  // this covers all blocks (no gate).
  const serverIds = useMemo(
    () => new Set(store.serverData.map((b) => b.id)),
    [store.serverData],
  );

  const registerFocusHandle = useCallback(
    (id: string, handle: BlockFocusHandle) => {
      focusHandlesRef.current.set(id, handle);
      const pending = pendingFocusRef.current;
      if (pending?.id === id) {
        pendingFocusRef.current = null;
        handle.focus({ scroll: pending.scroll });
      }
      return () => {
        focusHandlesRef.current.delete(id);
      };
    },
    [],
  );

  const setFlatOrder = useCallback((blocks: Block[]) => {
    flatOrderRef.current = blocks;
  }, []);

  const setRows = useCallback((blocks: Block[]) => {
    rowsRef.current = blocks;
  }, []);

  const requestBlockMenu = useCallback((id: string) => setBlockMenuDraftId(id), []);
  const clearBlockMenu = useCallback(
    (id?: string) => setBlockMenuDraftId((cur) => (id == null || cur === id ? null : cur)),
    [],
  );

  const focusBlock = useCallback(
    (id: string, caretOffset?: number, opts?: CaretLandOptions) => {
      const handle = focusHandlesRef.current.get(id);
      if (handle) {
        // When a caret offset is requested and this block is a text editor, land
        // the caret precisely (the same leaf-aware placement `merge` uses); else a
        // plain focus restoring its last selection.
        if (caretOffset !== undefined && handle.focusOffset) handle.focusOffset(caretOffset, opts);
        else handle.focus(opts);
      } else pendingFocusRef.current = { id, scroll: opts?.scroll ?? false };
    },
    [],
  );

  const focusBlockBoundary = useCallback(
    (id: string, edge: "start" | "end", opts?: CaretLandOptions): boolean => {
      const handle = focusHandlesRef.current.get(id);
      if (!handle) return false;
      if (handle.focusBoundary) handle.focusBoundary(edge, opts);
      else handle.focus(opts);
      return true;
    },
    [],
  );

  // --- Unified undo/redo (single document-level stack) ----------------------
  // ONE stack covers both text and structure (there is no per-block Lexical
  // `HistoryPlugin`): structural ops (create/split/merge/indent/outdent/delete/
  // move/convert/bulk) AND text edits (mirrored per-block `Y.UndoManager`
  // items via `recordTextEdit`). Structural recording happens at the mutation
  // chokepoints below: snapshot the current rows, compute the resulting rows,
  // diff into a minimal patch pair, and `record` undo/redo thunks that
  // dispatch those patches.
  // SCOPED: the stack itself is the tab's (mounted in `TabSurface`), but these
  // thunks close over THIS editor's mount — the per-`pageId` optimistic store and
  // per-block `Y.UndoManager`s, which die with the doc. So the editor's entries
  // are dropped when it unmounts (a Miller `swap` remounts the column on page
  // navigation), leaving other plugins' mount-free entries on the stack.
  const { record, undo, redo, canUndo, canRedo } = useScopedUndoRedo();

  // Dispatch a minimal patch through the store's overlay pipeline (instant
  // overlay + server reconcile on the persistent path; a synchronous state write
  // in memory). Goes DIRECTLY to `store.dispatch`, never through
  // `recordStructural`, so a replayed patch is never re-recorded — and the
  // primitive's re-entrancy guard ignores `record` during replay anyway.
  const dispatchPatch = useCallback(
    (patch: BlockPatch) => {
      if (isEmptyPatch(patch)) return;
      store.dispatch(buildPatchOverlayOp(patch));
    },
    [store],
  );

  // Record a before→after change as a reversible command. Diffs the two full-row
  // snapshots into minimal forward/reverse patches; the thunks dispatch them and
  // best-effort restore focus to `focusId` (the block the user was on). A no-op
  // diff records nothing. `coalesceKey` is threaded into the entry so run-together
  // edits (typing) merge into one undo step; structural ops pass none.
  const recordPatchEntry = useCallback(
    (
      before: Block[],
      after: Block[],
      label: string,
      focusId: string | null,
      coalesceKey?: string,
    ) => {
      const derived = derivePatchEntry(before, after, focusId);
      if (!derived) return;
      const { undoPatch, redoPatch, undoFocus, redoFocus } = derived;
      record({
        label,
        coalesceKey,
        undo: () => {
          dispatchPatch(undoPatch);
          // Undo/redo reveals the affected block — it may be off-screen.
          if (undoFocus) queueMicrotask(() => focusBlock(undoFocus, undefined, { scroll: true }));
        },
        redo: () => {
          dispatchPatch(redoPatch);
          if (redoFocus) queueMicrotask(() => focusBlock(redoFocus, undefined, { scroll: true }));
        },
      });
    },
    [record, dispatchPatch, focusBlock],
  );

  // Structural ops never coalesce (each is a distinct undo step), so this passes
  // no `coalesceKey` — preserving the previous `recordStructural` behavior exactly.
  const recordStructural = useCallback(
    (before: Block[], after: Block[], label: string, focusId: string | null) => {
      recordPatchEntry(before, after, label, focusId);
    },
    [recordPatchEntry],
  );

  // Combined recorder: a structural op whose forward apply
  // ALSO edited a content doc (split's origin-truncation, merge's target-append)
  // is ONE stack entry — a single Cmd+Z reverses the rows AND the doc together,
  // so they can never disagree. `docEdit` comes from `captureBlockDocEdit` (or a
  // hand-built doc-level pair for an unmounted target); undo runs it FIRST
  // (while the doc's editor is still bound), redo re-applies the patch first
  // (recreating rows the doc edit's subscribers may need). `undoTextOverride`
  // pins a restored row's `data.text` to the LIVE runs captured at op time —
  // for merge, the deleted source block's doc is re-SEEDED from that row on
  // undo, and the row snapshot may lag the doc by the projection debounce.
  const recordStructuralWithDocEdit = useCallback(
    (
      before: Block[],
      after: Block[],
      label: string,
      focusId: string | null,
      docEdit: CapturedBlockDocEdit | null,
      undoTextOverride?: { blockId: string; runs: RichText },
    ) => {
      const derived = derivePatchEntry(before, after, focusId, undoTextOverride);
      // Bail only when there is NOTHING to record: empty patches AND no doc edit.
      // A docEdit-only entry (empty structural diff) must still record so its
      // content-doc reverse/re-apply lands on the stack; its (empty) patches
      // no-op through `dispatchPatch` and focus falls back to `focusId`.
      if (!derived && !docEdit) return;
      const { undoPatch, redoPatch, undoFocus, redoFocus } = derived ?? {
        undoPatch: { creates: [], updates: [], deleteIds: [] },
        redoPatch: { creates: [], updates: [], deleteIds: [] },
        undoFocus: focusId,
        redoFocus: focusId,
      };
      record({
        label,
        undo: async () => {
          await docEdit?.undo();
          dispatchPatch(undoPatch);
          // Undo/redo reveals the affected block — it may be off-screen.
          if (undoFocus) queueMicrotask(() => focusBlock(undoFocus, undefined, { scroll: true }));
        },
        redo: async () => {
          dispatchPatch(redoPatch);
          await docEdit?.redo();
          if (redoFocus) queueMicrotask(() => focusBlock(redoFocus, undefined, { scroll: true }));
        },
      });
    },
    [record, dispatchPatch, focusBlock],
  );

  // Text recorder: one shared-stack entry per captured
  // `Y.UndoManager` item. Deliberately NO `coalesceKey`: the manager's
  // captureTimeout already folded the typing run into the ONE item these
  // thunks pop — app-level coalescing would merge two entries over two manager
  // items and break the 1:1 LIFO correspondence (`um.undo()` pops exactly one).
  const recordTextEdit = useCallback(
    (blockId: string, edit: CapturedBlockDocEdit, label = "Edit text") => {
      record({
        label,
        undo: async () => {
          await edit.undo();
          // Undo/redo reveals the edited block — it may be off-screen.
          queueMicrotask(() => focusBlock(blockId, undefined, { scroll: true }));
        },
        redo: async () => {
          await edit.redo();
          queueMicrotask(() => focusBlock(blockId, undefined, { scroll: true }));
        },
      });
    },
    [record, focusBlock],
  );

  // Standalone content-doc recorder: capture a SYNCHRONOUS doc edit (the
  // inline-markdown autoformat today) as ONE text entry of its own, rather than
  // folded into a structural op the way `recordStructuralWithDocEdit` does it.
  // `captureBlockDocEdit` is the whole mechanism — leading/trailing
  // `stopCapturing` fence the edit off from the surrounding typing run, and the
  // mirror is suppressed so the entry is recorded HERE, once, under the caller's
  // own label. `null` means the edit changed nothing (or the block has no live
  // doc): nothing to reverse, so nothing lands on the stack.
  //
  // Recording lives at this chokepoint deliberately: a component that reached
  // into `captureBlockDocEdit` itself would be a second, undocumented undo
  // recorder outside the two that this file owns.
  //
  // No `coalesceKey`, same reasoning as `recordTextEdit` above: the manager's
  // captureTimeout already did the grouping, and app-level coalescing would
  // break the 1:1 LIFO correspondence (`um.undo()` pops exactly one item).
  const recordDocEdit = useCallback(
    (blockId: string, label: string, edit: () => void) => {
      const captured = captureBlockDocEdit(blockId, edit);
      if (captured) recordTextEdit(blockId, captured, label);
    },
    [recordTextEdit],
  );

  // THE single chokepoint for any DIRECT row-set mutation (everything that is not
  // a `BlockOp`). Snapshot the current rows, apply `transform` to the whole array,
  // diff into a minimal forward/reverse patch pair, optionally `record` it on the
  // unified stack, then dispatch the forward patch through the SAME
  // optimistic-patch pipeline as structural ops. `diffBlocks`/`patchesFromDiff`
  // already operate over the whole array, so widening the chokepoint from one row
  // to the row SET preserves the property verbatim: forward apply and undo/redo
  // stay symmetric by construction, and a no-op diff records and dispatches
  // nothing.
  //
  // Every such writer funnels through here — `projectText`, the block API's
  // `update`/`setExpanded`, and `convertTo` in BOTH of its shapes (a plain type
  // swap, and the `wrapOnConvert` wrap, which mints the container row and
  // reparents the origin in ONE patch, hence ONE undo entry).
  //
  // Undo/redo restore focus to `focusId` (at `caretOffset` when given).
  // `coalesceKey` merges run-together edits into one undo step; `record: false`
  // keeps a mutation off the stack (view state) while still flowing it through
  // the optimistic pipeline.
  const commitRows = useCallback(
    (
      transform: (rows: Block[]) => Block[],
      opts: {
        label: string;
        /** Block to re-focus on undo/redo; null when no row owns the caret. */
        focusId: string | null;
        coalesceKey?: string;
        caretOffset?: number;
        record?: boolean;
      },
    ) => {
      // The patch is FIELD-SCOPED: `transform` produces whole rows, but the
      // diff reduces them to the fields that actually changed, so a text writer
      // never authors `type` and cannot clobber a concurrent conversion. That is
      // the structural half of the fix. RENDER-FRESH rows (not `rowsRef`, which a
      // consumer effect sets, so it lags within a commit) are the belt: the case
      // that proved both is a conversion into a type with its own dispatch
      // component (quote/prompt), which unmounts the text editor, whose
      // projection flush fires from the unmount cleanup — BEFORE the effect
      // refreshes `rowsRef`.
      const before = liveRowsRef.current;
      const after = transform(before);
      const { undo: undoPatch, redo: redoPatch } = patchesFromDiff(diffBlocks(before, after));
      if (isEmptyPatch(undoPatch) && isEmptyPatch(redoPatch)) return;
      const { focusId } = opts;
      if (opts.record !== false) {
        record({
          label: opts.label,
          coalesceKey: opts.coalesceKey,
          undo: () => {
            dispatchPatch(undoPatch);
            // Undo/redo reveals the mutated block — it may be off-screen.
            if (focusId) {
              queueMicrotask(() => focusBlock(focusId, opts.caretOffset, { scroll: true }));
            }
          },
          redo: () => {
            dispatchPatch(redoPatch);
            if (focusId) {
              queueMicrotask(() => focusBlock(focusId, opts.caretOffset, { scroll: true }));
            }
          },
        });
      }
      dispatchPatch(redoPatch);
    },
    [record, dispatchPatch, focusBlock, liveRowsRef],
  );

  // The one-row case of `commitRows`: rewrite exactly the target row and land
  // undo/redo focus on it.
  const commitRow = useCallback(
    (
      blockId: string,
      transform: (b: Block) => Block,
      opts: {
        label: string;
        coalesceKey?: string;
        caretOffset?: number;
        record?: boolean;
      },
    ) => {
      commitRows((rows) => rows.map((b) => (b.id === blockId ? transform(b) : b)), {
        ...opts,
        focusId: blockId,
      });
    },
    [commitRows],
  );

  // `content doc → data.text` projection write (see the interface doc). NEVER
  // recorded: text history lives in the block's `Y.Doc` (wired into the
  // unified stack via `recordTextEdit`), so a projection landing on the undo
  // stack would double-count it. Still flows through the shared optimistic
  // patch pipeline (server write + `blocksChanged` fan-out) and no-ops when
  // the row is unchanged or gone.
  const projectText = useCallback(
    (blockId: string, runs: RichText) => {
      // Existence gate against the RENDER-FRESH rows, not `rowsRef` (Stage 3b
      // fix): the projection's unmount flush fires while a structural patch
      // that deleted this block is committing — `rowsRef` still lists the row
      // at that instant, and projecting through it would UPSERT (resurrect)
      // the just-deleted block. `liveRowsRef` already reflects the deletion.
      if (!liveRowsRef.current.some((b) => b.id === blockId)) return;
      // The gate above can't cover the window where the row was deleted
      // SERVER-side (history restore, another tab's delete) but the push hasn't
      // reached this client yet. It doesn't have to: a text projection changes
      // only `data`, so the patch is an UPDATE, and an update never creates —
      // on the client overlay and the server writer alike. A flush landing in
      // that window is skipped instead of resurrecting the row with pre-delete
      // text; the race is closed by the patch's shape, not by a flag.
      commitRow(
        blockId,
        (b) => ({ ...b, data: { ...(b.data ?? {}), text: runs } }),
        { label: "Project text", record: false },
      );
    },
    [commitRow, liveRowsRef],
  );

  const bulkDelete = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      // Record before firing: after = current rows minus each id's full subtree
      // (the server cascade-deletes the subtree, so mirror that exactly).
      const before = rowsRef.current;
      const removed = new Set(ids.flatMap((id) => subtreeIds(before, id)));
      const after = before.filter((b) => !removed.has(b.id));
      recordStructural(before, after, "Delete blocks", null);
      store.bulkDelete(ids);
    },
    [store, recordStructural],
  );

  const bulkMove = useCallback(
    (args: { ids: string[]; parentId: string | null; afterId: string | null }) => {
      if (args.ids.length === 0) return;
      // Positional intent goes to the store (the server owns rank authority), but
      // this editor holds the page's forest whole, so it can predict the placement
      // locally for the undo record — exactly as `move` does. `planBulkMove` is the
      // SAME planner the store and the server run, so the recorded after-state is
      // byte-identical to what gets committed. No optimistic overlay: the forward
      // write is still the bespoke endpoint, like `bulkDelete`.
      const before = rowsRef.current;
      const plan = planBulkMove(toNodes(before), args);
      // A refused plan (empty selection, or a destination inside the selection)
      // changes nothing — drop it before recording and before the network, the
      // same discipline `dispatchOp` applies to an empty reducer diff.
      if (plan.refusal) return;
      const after = fromNodes(applyBulkMove(toNodes(before), plan), before);
      // `focusId` is null for the reason `bulkDelete` passes null: a bulk move is
      // driven from block-selection mode, where focus lives on the selection
      // container rather than in any row. `"Move blocks"` is a literal because
      // `bulkMove` is not a `BlockOp` and so has no `OP_LABELS` entry.
      recordStructural(before, after, "Move blocks", null);
      store.bulkMove(args);
    },
    [store, recordStructural],
  );

  const move = useCallback(
    (id: string, zone: "before" | "after", targetId: string) => {
      // Positional intent, never a rank: the STORE owns rank authority (the
      // server mints it against the true sibling set; the memory store mints it
      // over its own complete forest). But this editor legitimately holds the
      // complete forest for the page (`blocksResource` is unfiltered), so it can
      // predict the resulting rank locally for the optimistic overlay and the
      // undo record. The store's value is authoritative on reconcile.
      const before = rowsRef.current;
      const dest = computeDrop(before, id, zone, targetId);
      if (!dest) return;
      const current = before.find((r) => r.id === id);
      if (
        current &&
        current.parentId === dest.parentId &&
        Rank.equals(current.rank, dest.rank)
      ) {
        return;
      }
      const after = fromOpResult(
        before,
        {
          kind: "move",
          blockId: id,
          parentId: dest.parentId,
          rank: dest.rank.toJSON(),
        },
        anchorTypes,
      );
      recordStructural(before, after, OP_LABELS.move, id);
      store.move(id, { parentId: dest.parentId, rank: dest.rank, targetId, zone });
    },
    [store, recordStructural, anchorTypes],
  );

  // Apply a single tree op optimistically AND record it for structural undo. The
  // effect is captured from the CURRENT rows (`rowsRef.current`), so chained
  // keystrokes compose; `store.dispatch` overlays the prediction and fires the
  // network call (a synchronous state write in memory). New blocks carry
  // client-minted ids, so callers mint + focus up front. The op's after-state is
  // computed with the SAME pure `applyBlockOp` the server runs, so the recorded
  // diff is exact.
  const dispatchOp = useCallback(
    (op: BlockOp) => {
      const before = rowsRef.current;
      const after = fromOpResult(before, op, anchorTypes);
      // An op the reducer fully refused (Tab on a first child, Shift+Tab at top
      // level, a bulk indent whose whole run is blocked) changes nothing. Drop it
      // here rather than dispatching: an empty-effect overlay would read as
      // already-absorbed to the apply-guard, and an empty patch pair would put a
      // do-nothing entry on the undo stack.
      const diff = diffBlocks(before, after);
      if (diff.inserted.length === 0 && diff.updated.length === 0 && diff.deleted.length === 0) {
        return;
      }
      recordStructural(before, after, OP_LABELS[op.kind], opFocusId(op, before));
      store.dispatch(buildOverlayOp(op, before, anchorTypes));
    },
    [store, recordStructural, anchorTypes],
  );

  // Paste a serialized forest — a plain `dispatchOp`, which is the whole point:
  // a paste is a `BlockOp` like any other structural edit, so routing it here
  // (rather than at the store seam, where it used to sit) is what puts it on the
  // undo stack, drops a refused paste before the network, and keeps ONE place
  // that records structural mutations.
  //
  // Identity is minted HERE, client-side, and travels on the node: the overlay
  // renders the pasted blocks on the keystroke and the server push is a
  // confirmation rather than the first time the user sees their content (see the
  // "Paste is an op" section of this plugin's CLAUDE.md).
  //
  // MUST stay below `dispatchOp` — it closes over it.
  const paste = useCallback(
    (args: {
      blocks: SerializedBlock[];
      afterId: string | null;
      parentId?: string | null;
    }) => {
      const forest = withMintedIds(args.blocks);
      if (forest.length === 0) return;
      // `parentId` defaults to the PAGE's own id, not null: the reducer's forest
      // excludes the page row, so the page id is how "the content top level" is
      // addressed (see the `paste` op's `parentId` doc).
      dispatchOp({
        kind: "paste",
        forest,
        afterId: args.afterId,
        parentId: args.parentId ?? pageId,
      });
    },
    [dispatchOp, pageId],
  );

  // Duplicate a selection — one `dispatchOp` for the whole gesture, for paste's
  // reasons: it is what puts the clones on the undo stack as ONE entry and what
  // makes them render on the click rather than after the round-trip. Ids are
  // minted HERE, client-side, which is exactly what the old server-minting path
  // could not offer (no client-computed after-state to invert).
  //
  // MUST stay below `dispatchOp` — it closes over it.
  const bulkDuplicate = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      const before = rowsRef.current;
      // Document-ordered for determinism and to match every other
      // selection-driven op (the folds, `pasteAnchorId`) — `selectionRoots`
      // preserves input-ARRAY order, which is nobody's order. Not load-bearing
      // for agreement: the array travels on the op, so both sides fold it
      // identically.
      const roots = inDocumentOrder(toNodes(before), selectionRoots(before, new Set(ids)));
      if (roots.length === 0) return;
      // One `serializeForest` call PER root, not one zipped call: a filtered
      // positional array is exactly the silent-desync hazard the paste op's
      // "ids ride the node" rule exists to prevent.
      dispatchOp({
        kind: "duplicate",
        placements: roots.map((id) => ({
          afterId: id,
          forest: withMintedIds(serializeForest(before, [id])),
        })),
      });
    },
    [dispatchOp],
  );

  // Indent / outdent a SET of blocks (the selection roots). The single-block Tab
  // in a text editor is the one-element case, routed through the same op — see
  // `foldIndent`/`foldOutdent` for why a set moves as one rigid body.
  const indentBlocks = useCallback(
    (blockIds: string[]) => {
      if (blockIds.length > 0) dispatchOp({ kind: "indent", blockIds });
    },
    [dispatchOp],
  );

  const outdentBlocks = useCallback(
    (blockIds: string[]) => {
      if (blockIds.length > 0) dispatchOp({ kind: "outdent", blockIds });
    },
    [dispatchOp],
  );

  // Dissolve a container in place (see the context field's doc). A plain
  // `dispatchOp`, so it is optimistic, recorded as one undo entry, and refused as
  // a no-op when `blockId` is gone or is a page row.
  const unwrapBlock = useCallback(
    (blockId: string) => {
      dispatchOp({ kind: "unwrap", blockId });
    },
    [dispatchOp],
  );

  // Overlay-dispatch triplet shared by the split / offscreen-merge executors:
  // snapshot the current rows, compute the after-state with the SAME pure
  // `applyBlockOp` the store applies, dispatch through the store (instant
  // prediction + network call on the server path; a synchronous authoritative
  // write in memory), and return both snapshots for the combined record.
  // NOT used by the mounted-merge site, whose dispatch is deliberately deferred
  // into a microtask after the append lands (see the merge executor, issue #7).
  const applyOverlay = useCallback(
    (op: BlockOp): { before: Block[]; after: Block[] } => {
      const before = rowsRef.current;
      const after = fromOpResult(before, op, anchorTypes);
      store.dispatch(buildOverlayOp(op, before, anchorTypes));
      return { before, after };
    },
    [store, anchorTypes],
  );

  // Focus a freshly-minted block by its known id. If its text editor has already
  // mounted, focus immediately; otherwise queue it so `registerFocusHandle`
  // focuses it on mount (the live push will mount it shortly).
  const focusNew = useCallback((id: string) => {
    // A freshly-created block (Enter / split / insert) is a scroll-wanted
    // landing: the new block may be below the fold, so reveal it.
    pendingFocusRef.current = { id, scroll: true };
    const handle = focusHandlesRef.current.get(id);
    if (handle) {
      pendingFocusRef.current = null;
      handle.focus({ scroll: true });
    }
  }, []);

  // Insert a new block at the end of the page. Top-level page content is
  // parented to the page block (`parentId: pageId`), since `computePageId(null)`
  // is null. Omitting `afterId` lets the reducer append it after the last
  // existing sibling under the page. The id is minted up front so focus does not
  // wait on the server round-trip.
  const insert = useCallback(
    (type: string, data: unknown) => {
      const newId = crypto.randomUUID();
      focusNew(newId);
      dispatchOp({ kind: "insert", newId, type, data, parentId: pageId });
    },
    [pageId, dispatchOp, focusNew],
  );

  // Insert a new block at the TOP of the page, before the current first
  // top-level block (`beforeId` — the reducer ranks it ahead of that sibling).
  // An empty page has no such sibling, so it falls back to the plain
  // parent-append, which is equivalent there.
  const insertFirst = useCallback(
    (type: string, data: unknown) => {
      const newId = crypto.randomUUID();
      focusNew(newId);
      const first = childrenOf(toNodes(rowsRef.current), pageId)[0];
      dispatchOp(
        first
          ? { kind: "insert", newId, type, data, beforeId: first.id }
          : { kind: "insert", newId, type, data, parentId: pageId },
      );
    },
    [pageId, dispatchOp, focusNew],
  );

  // The `wrapOnConvert` half of `convertTo`: mint a container row of `type` and
  // make `blockId` its FIRST CHILD, in ONE patch through the shared row-set
  // chokepoint — hence ONE undo entry, and the reducer's childless-anchor prune
  // is never observed mid-flight (there is no intermediate state where the
  // container exists without its child).
  //
  // The ORIGIN keeps its id, type, `data` (its `text` projection included, since
  // its content doc is untouched), children and rank. Keeping the id is
  // load-bearing, not an optimization: its `page_block_docs` Yjs doc, its
  // `Y.UndoManager` and its registered `BlockFocusHandle` are all keyed by block
  // id, so the caret simply stays put — no `focusNew`, no remount race. The NEW
  // id goes to the container, which is void and never opens a content doc, so
  // the doc-init FK gate applies to neither row.
  //
  // The container takes a FRESH rank strictly before the origin's, never the
  // origin's own: reusing it would need the ranks to be parked (two rows briefly
  // sharing one `(parent_id, rank)` slot), and the in-memory store has no
  // `parkRanks` — it applies the patch verbatim.
  const wrapInContainer = useCallback(
    (blockId: string, type: string, containerData: unknown) => {
      const containerId = crypto.randomUUID();
      commitRows(
        (rows) => {
          const origin = rows.find((b) => b.id === blockId);
          if (!origin) return rows;
          const nodes = toNodes(rows);
          const siblings = childrenOf(nodes, origin.parentId);
          const index = siblings.findIndex((s) => s.id === origin.id);
          const prev = index > 0 ? siblings[index - 1] : undefined;
          const container: Block = {
            id: containerId,
            pageId: origin.pageId,
            parentId: origin.parentId,
            type,
            data: containerData,
            // Anchors declare `collapsible: "never"`, so a stored `false` would be
            // inert anyway — but mint it open so any consumer reading the flag
            // raw agrees with what the surface renders.
            expanded: true,
            rank: Rank.between(
              prev ? Rank.from(prev.rank) : null,
              Rank.from(String(origin.rank)),
            ),
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          return [
            ...rows.map((b) =>
              b.id === blockId ? { ...b, parentId: containerId } : b,
            ),
            container,
          ];
        },
        { label: "Wrap in container", focusId: blockId },
      );
    },
    [commitRows],
  );

  // Merge `sourceId`'s content + subtree into the previous VISIBLE line and
  // delete it — the shared core of Backspace-at-start (`merge`, source = this
  // block) and Delete-at-end (`mergeNext`, source = the NEXT visible line).
  // `runs` is the source's authoritative live runs (undefined ⇒ the reducer
  // falls back to the stored projection). The reducer merges into
  // `prevVisibleLine(source)`, so we resolve the same target here to land the
  // caret at the JOIN offset (the target's text length BEFORE the append) and
  // drive the target's bound editor. Both source blocks flow through ONE
  // implementation, so the microtask-deferred append-first ordering,
  // `captureBlockDocEdit`, `recordStructuralWithDocEdit`, and `undoTextOverride`
  // (keyed to the SOURCE row) are reused unchanged.
  const mergeBlock = useCallback(
    (sourceId: string, runs?: RichText) => {
      const nodes = toNodes(rowsRef.current);
      const block = nodes.find((b) => b.id === sourceId);
      if (!block) return;
      const target = prevVisibleLine(nodes, block);
      if (!target) return; // defensive: nothing to merge into
      // Composite-union backstop: merge is strictly in-page. Over the union the
      // previous visible line can belong to ANOTHER page (the line above an
      // expanded sub-page's first block, or below its last); the keystroke
      // resolver already guards the boundary, so a cross-page source/target
      // pair here is a stray call — bail rather than splice text across two
      // pages' stores.
      if (target.pageId !== block.pageId) return;
      // The reducer's row-level text concatenation is ignored by bound
      // editors — the merging block's LIVE runs (may contain unflushed
      // edits) must land in the TARGET's content doc too. Both variants
      // record ONE combined stack entry (structural patch + doc edit) so a
      // single Cmd+Z restores this block's row AND un-appends the target's
      // doc together. The restored source row's `data.text` is pinned to
      // the live `mergingRuns` (undoTextOverride): the source doc was
      // FK-cascade-dropped with the row, so on undo it re-seeds from
      // `data.text` — which must be exactly what was removed from the
      // target, not a projection-lagged snapshot.
      const mergingRuns = runs ?? runsOfNode(block);
      const targetHandle = focusHandlesRef.current.get(target.id);
      const op: BlockOp = { kind: "merge", blockId: sourceId, runs };
      if (targetHandle?.appendRunsAtEnd) {
        // Mounted target: drive its bound editor (append + caret at the live
        // join). Append-FIRST ordering (issue #7): the append rides a microtask
        // (deferred so the current keydown can't act on the newly-focused
        // block), and the structural delete overlay is dispatched only AFTER the
        // append lands — so a throwing append leaves BOTH blocks intact (a loud
        // unhandled rejection, overlay never dispatched), matching the offscreen
        // branch's guarantee, instead of removing the source row with its text
        // un-transferred. `before`/`after` are captured up front so they snapshot
        // the pre-merge rows; the dispatch is kept explicit here (not
        // `applyOverlay`) precisely because its ordering is deferred.
        const append = targetHandle.appendRunsAtEnd;
        const before = rowsRef.current;
        const after = fromOpResult(before, op, anchorTypes);
        queueMicrotask(() => {
          // `captureBlockDocEdit` runs `append` synchronously (surgery uses
          // `discrete: true`), so a throw propagates out of the microtask
          // BEFORE the dispatch — the source row is never removed.
          const docEdit = captureBlockDocEdit(target.id, () => append(mergingRuns));
          store.dispatch(buildOverlayOp(op, before, anchorTypes));
          recordStructuralWithDocEdit(before, after, OP_LABELS.merge, sourceId, docEdit, {
            blockId: sourceId,
            runs: mergingRuns,
          });
        });
      } else {
        // Unmounted target (virtualized offscreen): lossless doc-level
        // append FIRST, structural delete only after it lands — a failed
        // append leaves both blocks intact (loud unhandled rejection)
        // instead of orphaning the text in a row the target's doc would
        // later overwrite via projection. No caret to place: the target
        // has no editor. No live undo manager either, so the combined
        // entry's doc thunks are doc-level: undo truncates the target's
        // doc back to the returned join offset, redo re-appends. The
        // target's `data.text` is read at thunk run time (doc-init seeds
        // from it only if the doc row vanished meanwhile).
        const targetId = target.id;
        void appendRunsToBlockDoc(targetId, runsOfNode(target), mergingRuns).then(
          ({ joinOffset }) => {
            const { before, after } = applyOverlay(op);
            const targetDataText = () =>
              (rowsRef.current.find((b) => b.id === targetId)?.data as
                | Record<string, unknown>
                | null)?.text;
            const docEdit: CapturedBlockDocEdit = {
              undo: () => truncateBlockDocFrom(targetId, targetDataText(), joinOffset),
              redo: async () => {
                await appendRunsToBlockDoc(targetId, targetDataText(), mergingRuns);
              },
            };
            recordStructuralWithDocEdit(before, after, OP_LABELS.merge, sourceId, docEdit, {
              blockId: sourceId,
              runs: mergingRuns,
            });
          },
        );
      }
    },
    [store, applyOverlay, recordStructuralWithDocEdit, anchorTypes],
  );

  // THE row-side half of a type change, shared by `BlockEditorAPI.convertTo` and
  // `convertStrippingText` so the two can never drift. Recorded (a conversion is
  // a document edit) and dispatched through the same optimistic patch pipeline
  // as its own undo/redo; `commitRow` no-ops a missing/unchanged block.
  //
  // The wrap/swap decision lives HERE, not on `convertTo`, precisely because
  // this is the shared half: with it one level up, `convertStrippingText` — the
  // path the `/` menu, the gutter-`+` draft and the markdown shortcuts all take
  // — silently bypassed it, so `/callout` retyped the origin into a container
  // instead of wrapping it (losing its text, and 400ing on the callout's void
  // schema). Every caller reaching a type change must reach this decision.
  const convertRow = useCallback(
    (blockId: string, type: string, data: RowData, expanded?: boolean) => {
      // Converting INTO a `wrapOnConvert` type is a WRAP, not a type swap: mint
      // a container row and make THIS block its first child, keeping this
      // block's id, type, data (text projection included), children and rank.
      // `data` is the CONTAINER's seed on this path, not the origin's — there is
      // no type change to carry a payload for, so the caller's `data` is
      // deliberately ignored in favour of the target's own `empty()`, and
      // `preserveText` has nothing to do here.
      const target = blockHandles.get(type);
      if (target?.wrapOnConvert) {
        wrapInContainer(blockId, type, target.empty?.() ?? {});
        return;
      }
      commitRow(
        blockId,
        (b) => ({
          ...b,
          type,
          data: preserveText(b.data, data, acceptsTextRef.current(type)),
          expanded: expanded ?? b.expanded,
        }),
        { label: "Change block type" },
      );
    },
    [commitRow, acceptsTextRef, blockHandles, wrapInContainer],
  );

  const convertStrippingText = useCallback(
    ({
      blockId,
      from,
      to,
      type,
      data,
      expanded,
    }: {
      blockId: string;
      from: number;
      to: number;
      type: string;
      data: RowData;
      expanded?: boolean;
    }) => {
      // (1) The doc. `deleteRange` is DISCRETE, so its Yjs transaction commits
      // within this task — before React can re-render and move the block (a
      // `wrapOnConvert` target reparents it into a fresh container, which DOES
      // remount its editor). That is the guarantee, not the statement order:
      // called from the slash menu this runs inside the caret menu's own
      // `editor.update()`, where Lexical defers the nested update to the end of
      // the outer one — still ahead of any re-render, which is all that matters.
      //
      // A block with no registered handle (text-less, or not yet mounted) has
      // nothing to strip — an empty span is the normal case here, not a
      // swallowed failure.
      focusHandlesRef.current.get(blockId)?.deleteRange?.(from, to);
      // (2) The row. It states the TYPE and nothing about text: the stripped
      // content reaches `data.text` on its own, through the projection. Strictly
      // AFTER the strip — `/callout` must lose its `/callout` query from the
      // content doc before the block becomes a container's first child.
      convertRow(blockId, type, data, expanded);
    },
    [convertRow],
  );

  const makeBlockAPI = useCallback(
    (blockId: string): BlockEditorAPI => ({
      update(data: RowData) {
        // The single data-write affordance every block renderer uses — routed
        // through `commitRow` so non-text edits (to-do checked, callout color,
        // image src, …) are optimistic AND recorded. `coalesceKey: blockId`
        // collapses streaming/rapid same-block edits into one undo step. The
        // blob is REPLACED, but `text` is carried across by `preserveText`: a
        // control flipping `checked` must not be able to write a lagged text
        // snapshot back over the row.
        commitRow(
          blockId,
          (b) => ({ ...b, data: preserveText(b.data, data, acceptsTextRef.current(b.type)) }),
          { label: "Edit block", coalesceKey: blockId },
        );
      },
      setExpanded(expanded: boolean) {
        // Pure view state — deliberately NOT recorded into history (`record: false`):
        // Notion doesn't undo collapse/expand; it's not a document edit. Still flows
        // through the optimistic patch pipeline for snappiness, self-correcting on
        // re-click via the blocksResource push.
        commitRow(blockId, (b) => ({ ...b, expanded }), { label: "Toggle collapse", record: false });
      },
      convertTo(type: string, data: RowData, opts?: { expanded?: boolean }) {
        // The plain path, for a type change that touches no text at all. A
        // conversion that CONSUMES some of the block's own text (a `/query`, a
        // markdown prefix) must go through `convertStrippingText` instead.
        //
        // Both land on `convertRow`, which owns the wrap-vs-swap decision — so
        // Turn-into and `url-paste` get `wrapOnConvert` from the same place the
        // slash menu does, rather than from a check only this caller ran.
        convertRow(blockId, type, data, opts?.expanded);
      },
      insertAfter(type: string, data: unknown, opts?: { focus?: boolean }) {
        const newId = crypto.randomUUID();
        // `focus: false` is for callers that keep focus elsewhere while acting on
        // the new block (the gutter `+` filter field). Focusing here would race
        // them: `focusNew` also arms a pending focus that fires when the block
        // mounts on the confirming push, stealing focus back after the fact.
        if (opts?.focus !== false) focusNew(newId);
        dispatchOp({ kind: "insert", newId, type, data, afterId: blockId });
        return newId;
      },
      split(
        position: number,
        opts?: {
          asChild?: boolean;
          childType?: string;
          siblingType?: string;
          tailData?: unknown;
          runs?: RichText;
        },
      ) {
        // Thin executor: the asChild decision is owned by `resolveKeystroke`
        // (the single intent step) and passed in explicitly. The new block's id
        // is minted up front so we can focus it without awaiting the response.
        const asChild = opts?.asChild ?? false;
        const newId = crypto.randomUUID();
        const op: BlockOp = {
          kind: "split",
          blockId,
          position,
          newId,
          asChild,
          childType: opts?.childType,
          siblingType: opts?.siblingType,
          tailData: opts?.tailData,
          runs: opts?.runs,
        };

        // Enter at the START of a NON-EMPTY block: the reducer inserts an empty
        // sibling ABOVE and leaves the origin completely untouched (id, full
        // text, children, content doc, expanded, data). The caret is already at
        // offset 0 and never lost focus — the Enter keydown was preventDefaulted,
        // so DOM focus stays in the origin editor. So do NOT `focusNew` (that
        // would steal focus to the new empty block), do NOT truncate the origin's
        // live doc (nothing moved out of it — no `captureBlockDocEdit`), and
        // record a PLAIN structural entry. `derivePatchEntry` sees the empty block
        // as the sole insert, so with `focusId = blockId` (the ORIGIN) redo re-focuses
        // the origin and undo (which deletes the empty block) also lands on the origin —
        // never `<body>`. The empty block seeds a trivially-empty content doc on
        // mount, exactly like a gutter-`+` insert. `runsLength > 0` isolates this
        // from empty-block Enter (position 0 but nothing after the caret), which
        // must keep spawning a plain empty sibling BELOW with the caret moving down.
        if (!asChild && position === 0 && runsLength(opts?.runs ?? []) > 0) {
          const { before, after } = applyOverlay(op);
          recordStructural(before, after, OP_LABELS.split, blockId);
          return;
        }

        // --- existing path (mid/end split, empty-block Enter, asChild) ---
        focusNew(newId);
        // The reducer left the HEAD in this block's row, but the bound editor
        // ignores rows — the LIVE content must be
        // truncated from the caret too. The op's `runs` were captured from the
        // live editor BEFORE this truncation, so the new block's `data.text`
        // seed (the tail its content doc initializes from on mount) is
        // caret-exact. Driving the deletion through Lexical (`truncateAt`)
        // lets the collab binding sync it into the content doc like any local
        // edit — and `captureBlockDocEdit` folds that doc edit into ONE
        // combined stack entry with the structural patch, so a single Cmd+Z
        // removes the new block AND restores this block's full pre-split
        // content (rows and docs reverse together, never half).
        //
        // The capture is DEFERRED a microtask: `split` is called from a
        // Lexical command handler, i.e. INSIDE this editor's own update — a
        // nested `editor.update` (even `discrete`) is queued by Lexical, so a
        // synchronous truncation call here would commit (and transact into
        // Yjs) only after `captureBlockDocEdit`'s window closed, escaping the
        // fold and double-recording as a plain text entry. One microtask puts
        // it outside the outer update; record order is unaffected (no other
        // record can interleave within the same task).
        const { before, after } = applyOverlay(op);
        queueMicrotask(() => {
          const docEdit = captureBlockDocEdit(blockId, () => {
            focusHandlesRef.current.get(blockId)?.truncateAt?.(position);
          });
          recordStructuralWithDocEdit(before, after, OP_LABELS.split, newId, docEdit);
        });
      },
      merge(opts?: { runs?: RichText }) {
        // Thin executor: `resolveKeystroke` already decided this is a merge (not
        // an outdent). Backspace-at-start merges THIS block up into the previous
        // visible line — the source is this block.
        mergeBlock(blockId, opts?.runs);
      },
      mergeNext() {
        // Delete-at-end merges the NEXT visible line UP into this block — the
        // source is that next line, not this one. By the completed visible-line
        // duality `prevVisibleLine(next) === this block`, so `mergeBlock` appends
        // into THIS (focused) editor and lands the caret at the join — i.e. the
        // caret does not move, which is what forward-delete must do.
        const nodes = toNodes(rowsRef.current);
        const block = nodes.find((b) => b.id === blockId);
        if (!block) return;
        const next = nextVisibleLine(nodes, block);
        if (!next) return; // defensive: nothing below to pull up
        // Read the next block's LIVE runs from its registered handle — the
        // authoritative source (its `data.text` projection lags by up to ~1s, so
        // falling back to it would silently drop text just typed there, an
        // absorbed failure). Fall back to `runsOfNode` ONLY when the block has no
        // handle: a text-less block (divider/image/file/embed) registers none,
        // and its empty runs are the TRUE answer, not a lagged miss.
        const nextHandle = focusHandlesRef.current.get(next.id);
        const runs = nextHandle?.readRuns ? nextHandle.readRuns() : runsOfNode(next);
        mergeBlock(next.id, runs);
      },
      remove() {
        dispatchOp({ kind: "delete", blockId });
      },
      indent() {
        // Thin executor: the "has a previous sibling to nest under" guard is owned
        // by `resolveKeystroke`; the reducer is a no-op if it somehow isn't. The
        // caret stays in this block, so re-focus it — unlike the selection-mode
        // bulk path, which keeps focus on the selection container.
        indentBlocks([blockId]);
        focusBlock(blockId);
      },
      outdent() {
        // Thin executor: the "is indented" guard is owned by `resolveKeystroke`;
        // the reducer is a no-op for a top-level block.
        outdentBlocks([blockId]);
        focusBlock(blockId);
      },
      navigate(dir, caret) {
        const flat = flatOrderRef.current;
        const idx = flat.findIndex((b) => b.id === blockId);
        if (idx < 0) return;
        // Skip void blocks with no registered focus handle (e.g. images), landing
        // on the nearest focusable block in this direction.
        const step = dir === "up" || dir === "left" ? -1 : 1;
        let j = idx + step;
        while (
          j >= 0 &&
          j < flat.length &&
          !focusHandlesRef.current.has(flat[j]!.id)
        ) {
          j += step;
        }
        const target = flat[j];
        // Running off the block order is not a dead end: the host may render a
        // caret surface right before/after the list (the page title). Blocks and
        // host chrome land the caret through the exact same rules.
        const surface: CaretSurface | null | undefined = target
          ? focusHandlesRef.current.get(target.id)
          : (step < 0 ? caretBeforeRef.current : caretAfterRef.current)?.current;
        if (!surface) return;
        // Leaving the block list entirely: no block owns the caret anymore, so
        // drop the focused-block state (an empty block would otherwise keep
        // showing its "Type '/' for commands" placeholder while the caret sits
        // in the title). A block target sets it back through its own `onFocus`.
        if (!target) setFocusedBlockId(null);
        // Keyboard cross-block navigation is scroll-wanted: the caret is moving
        // to a block the user may not be looking at, so follow it into view.
        landCaret(surface, dir, caret, { scroll: true });
      },
      onFocus() {
        setFocusedBlockId(blockId);
      },
    }),
    [
      dispatchOp,
      indentBlocks,
      outdentBlocks,
      focusNew,
      focusBlock,
      commitRow,
      convertRow,
      applyOverlay,
      recordStructural,
      recordStructuralWithDocEdit,
      mergeBlock,
    ],
  );

  const value = useMemo<BlockEditorContextValue>(
    () => ({
      pageId,
      blocks: store.data,
      serverIds,
      pending: store.pending,
      enabledBlockTypes,
      allowAttachments: serverSync,
      serverSync,
      focusedBlockId,
      setFocusedBlockId,
      registerFocusHandle,
      makeBlockAPI,
      convertStrippingText,
      setFlatOrder,
      setRows,
      rowsRef,
      focusBlock,
      focusBlockBoundary,
      move,
      indentBlocks,
      outdentBlocks,
      unwrapBlock,
      bulkDelete,
      bulkMove,
      bulkDuplicate,
      paste,
      insert,
      insertFirst,
      projectText,
      recordTextEdit,
      recordDocEdit,
      undo,
      redo,
      canUndo,
      canRedo,
      blockMenuDraftId,
      requestBlockMenu,
      clearBlockMenu,
      onOpenPage,
    }),
    [
      pageId,
      store.data,
      serverIds,
      store.pending,
      enabledBlockTypes,
      serverSync,
      focusedBlockId,
      setFocusedBlockId,
      registerFocusHandle,
      makeBlockAPI,
      convertStrippingText,
      setFlatOrder,
      setRows,
      focusBlock,
      focusBlockBoundary,
      move,
      indentBlocks,
      outdentBlocks,
      unwrapBlock,
      bulkDelete,
      bulkMove,
      bulkDuplicate,
      paste,
      insert,
      insertFirst,
      projectText,
      recordTextEdit,
      recordDocEdit,
      undo,
      redo,
      canUndo,
      canRedo,
      blockMenuDraftId,
      requestBlockMenu,
      clearBlockMenu,
      onOpenPage,
    ],
  );

  return (
    <BlockEditorContext.Provider value={value}>
      {children}
    </BlockEditorContext.Provider>
  );
}
