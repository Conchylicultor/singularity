import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react";
import {
  useEventCallback,
  useLatestRef,
} from "@plugins/primitives/plugins/latest-ref/web";
import { useScopedUndoRedo } from "@plugins/primitives/plugins/undo-redo/web";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import { resolveDropParent } from "@plugins/primitives/plugins/tree/core";
import {
  prevVisibleLine,
  nextVisibleLine,
  runsOfNode,
  runsLength,
  blockSelectionRoots,
  childrenOf,
  diffBlocks,
  inDocumentOrder,
  patchesFromDiff,
  isEmptyPatch,
  withMintedIds,
  newBlockId,
  namesField,
  hasTextKey,
  rowDataOf,
  type Block,
  type BlockNode,
  type BlockOp,
  type BlockPatch,
  type RichText,
  type RowData,
  type SerializedBlock,
} from "../core";
import {
  appendRunsToBlockDoc,
  truncateBlockDocFrom,
} from "./internal/use-collab-block-doc";
import {
  blockDocOwnerOf,
  captureBlockDocEdit,
  type CapturedBlockDocEdit,
} from "./internal/collab-session";
import type { ProjectTextFn } from "./internal/doc-sourced-runs";
import {
  buildPatchOverlayOp,
  predictOp,
  toNodes,
} from "./internal/optimistic-block-ops";
import { serializeForest } from "./serialize-blocks";
import { landCaret, landCaretAtOwnEdge } from "./internal/caret-landing";
import { createCaretAuthority } from "./internal/caret-authority";
import type { BlockFocusHandle } from "./internal/caret-authority";
import type {
  CaretLandOptions,
  CaretSurface,
  CaretSurfaceRef,
} from "./caret-surface";
import { useBlockHandles, useBlockOpContext } from "./internal/block-handles";
import { useMemoryBlockStore, type BlockStore } from "./block-store";
import { CompositeServerProviderHost } from "./composite-block-store";
import type { BlockEditorAPI } from "./types";

/** Human labels for the structural-undo history (tooltips / menus). */
const OP_LABELS: Record<BlockOp["kind"], string> = {
  insert: "Insert block",
  delete: "Delete blocks",
  split: "Split block",
  merge: "Merge blocks",
  indent: "Indent blocks",
  outdent: "Outdent blocks",
  unwrap: "Remove container",
  move: "Move block",
  bulkMove: "Move blocks",
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
    // A bulk delete names the whole selection; a single Backspace-delete names
    // exactly one block, and only then is there a caret to restore.
    case "delete":
      // A bulk indent/outdent/delete is driven from block-SELECTION mode, where
      // focus lives on the selection container, not in any block's editor.
      // Undo/redo then falls back to the patch's own first upsert.
      return op.blockIds.length === 1 ? (op.blockIds[0] ?? null) : null;
    case "bulkMove":
      // Same rule, same reason: a selection drag leaves focus on the container.
      return op.ids.length === 1 ? (op.ids[0] ?? null) : null;
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
  const redoFocus =
    focusId ?? redoPatch.creates[0]?.id ?? redoPatch.updates[0]?.id ?? null;
  const undoFocus =
    undoPatch.updates[0]?.id ?? undoPatch.creates[0]?.id ?? focusId ?? null;
  return { undoPatch, redoPatch, undoFocus, redoFocus };
}

// The handle type is declared BY the caret authority, which owns the registry it
// is registered into — the provider cannot reach a handle except through the
// authority's narrow surface, and that is the point (see `caret-authority.ts`).
export type { BlockFocusHandle } from "./internal/caret-authority";

/**
 * Carry the row's existing text projection across a row write.
 *
 * A row write states the fields it owns; `text` is not one of them — it is a
 * ~1 s-debounced projection of the block's content doc, whose sole writer is
 * `projectText`. A type change keeps the block's id, hence its doc, hence its
 * text, so `convertTo`/`update` carry the row's existing projection across
 * untouched rather than restating (or dropping) it. Everywhere else the key is
 * unrepresentable — that is what {@link RowData} buys.
 *
 * It carries the key UNCONDITIONALLY, including into a text-less target. Whether
 * the key may survive on the resulting row is not this function's question:
 * `conformRowText` answers it for every row write at the funnel, so a caller
 * cannot get it wrong by forgetting to ask (which is exactly how the projection
 * — a writer that never called through here — shipped a rejected patch on every
 * text-to-void conversion).
 */
function preserveText(prev: unknown, next: RowData): Record<string, unknown> {
  const text = (prev as Record<string, unknown> | null)?.text;
  if (text === undefined) return { ...next };
  return { ...next, text };
}

/** Empty type set — the `BlockOpContext` default, hoisted so it is stable. */
const EMPTY_TYPES: ReadonlySet<string> = new Set<string>();

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
  /**
   * Hand the caret authority the block list's interaction surface (the focusable
   * container `useBlockSelection` owns). While a landing is outstanding the
   * authority parks the caret THERE and buffers input from it, so the block the
   * user just left stops being an editing host and nothing can type into it.
   * Called by `BlockEditorInner`; there is exactly one such surface per editor.
   */
  attachContainer: (el: HTMLElement | null) => void;
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
  focusBlock: (
    id: string,
    caretOffset?: number,
    opts?: CaretLandOptions,
  ) => void;
  focusBlockBoundary: (
    id: string,
    edge: "start" | "end",
    opts?: CaretLandOptions,
  ) => boolean;
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
   *
   * `runs` is branded `DocSourcedRuns`: only `projectableRunsOf` (which reads
   * the block's own content `Y.Doc`) can produce that type, so persisting a
   * value the projection did not read from the doc's OWNER is a compile error —
   * never again a serialization of some editor's VIEW of it. See
   * `internal/doc-sourced-runs.ts`.
   */
  projectText: ProjectTextFn;
  /**
   * Row writer for an editing surface that has ALREADY put this edit on the
   * undo stack itself — today exactly `useBlockPlainText`, the one sanctioned
   * plain-text control a block may own (`<BlockTextArea>`).
   *
   * Same optimistic pipeline as `BlockEditorAPI.update`, with `record: false`
   * — the same exemption `projectText` takes, for the same reason: something
   * else owns this edit's history. Such a surface edits at INPUT frequency, so
   * it cannot pay for a row write per keystroke; it records synchronously (so
   * Cmd+Z reaches the keystroke you just typed) and persists on a timer. If
   * the timer's write recorded too, one typing burst would cost TWO Cmd+Z —
   * and the first of them would revert only the row while the control kept
   * rendering its own draft, i.e. an undo that visibly does nothing.
   *
   * Deliberately NOT on `BlockEditorAPI`: a block renderer must not be able to
   * write a row off the history by accident. Reaching this takes
   * `useBlockEditor()` and a deliberate claim that the edit is recorded.
   */
  commitRecordedRowData: (blockId: string, data: RowData) => void;
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
  recordTextEdit: (
    blockId: string,
    edit: CapturedBlockDocEdit,
    label?: string,
  ) => void;
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
}

const BlockEditorContext = createContext<BlockEditorContextValue | null>(null);

export function useBlockEditor(): BlockEditorContextValue {
  const ctx = useContext(BlockEditorContext);
  if (!ctx)
    throw new Error("useBlockEditor must be used within a BlockEditorProvider");
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
  caretBefore,
  caretAfter,
  children,
}: {
  pageId: string;
  initialBlocks: Block[];
  enabledBlockTypes?: readonly string[];
  children: ReactNode;
} & ProviderHostCaretProps) {
  const store = useMemoryBlockStore({ initialBlocks });
  return (
    <BlockEditorProviderInner
      store={store}
      pageId={pageId}
      serverSync={false}
      enabledBlockTypes={enabledBlockTypes}
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
  /** See `BlockEditor`'s props — the caret surfaces flanking the block list. */
  caretBefore?: CaretSurfaceRef;
  caretAfter?: CaretSurfaceRef;
  children: ReactNode;
}) {
  const [focusedBlockId, setFocusedBlockId] = useState<string | null>(null);
  const [blockMenuDraftId, setBlockMenuDraftId] = useState<string | null>(null);
  // Block-type facts the pure reducer and `convertTo` cannot derive from the
  // forest: the reducer's `BlockOpContext` (the store passes the SAME context,
  // and so does the server — all three mint it through `blockOpContextOf`) and
  // the handle registry `convertTo` reads `wrapOnConvert`/`empty()` off.
  const opCtx = useBlockOpContext();
  const anchorTypes = opCtx.anchorTypes ?? EMPTY_TYPES;
  // The same fact in the shape the visibility helpers take. A container borrows
  // its first child's line, so `prevVisibleLine`/`nextVisibleLine` cannot resolve
  // a merge target without it — pass anything else and the executor's target
  // disagrees with the reducer's, which is a merge that fires and does nothing.
  const isAnchorNode = useCallback(
    (node: BlockNode) => anchorTypes.has(node.type),
    [anchorTypes],
  );
  const blockHandles = useBlockHandles();
  // Read only inside `conformRowText`, which runs per row inside `commitRows` —
  // a ref keeps that callback's identity stable across registry churn.
  const blockHandlesRef = useLatestRef(blockHandles);
  // The flanking surfaces are read only inside imperative callbacks, so mirror
  // them into refs rather than threading them through `makeBlockAPI`'s deps.
  const caretBeforeRef = useLatestRef(caretBefore);
  const caretAfterRef = useLatestRef(caretAfter);
  const flatOrderRef = useRef<Block[]>([]);
  const rowsRef = useRef<Block[]>([]);

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

  // --- The caret authority ---------------------------------------------------
  // The ONE owner of "where the caret is" and of the block focus-handle registry
  // (`internal/caret-authority.ts`). Everything below hands it a landing policy;
  // nothing below can reach a handle to focus one itself, which is what makes the
  // mount-gap race unreintroducible rather than merely fixed.
  const liveIds = useMemo(
    () => new Set(store.data.map((b) => b.id)),
    [store.data],
  );
  const getOriginId = useEventCallback(() => focusedBlockId);
  const isLiveRow = useEventCallback((id: string) => liveIds.has(id));
  const [authority] = useState(() =>
    createCaretAuthority({ getOriginId, isLiveRow }),
  );

  // Push-based flight bound, never a timer: every commit is a fresh view of what
  // the surface RENDERS, so a claimed landing whose block never becomes a visible
  // line — a refused op, or a target inside a collapsed ancestor — is detected
  // and the buffered keystrokes go back to the origin. `flatOrderRef` is the
  // consumer's own flatten, written by a DESCENDANT's effect, which React runs
  // before this one in the same commit. No dep array: a commit that changed
  // nothing else is still evidence.
  useEffect(() => {
    authority.reconcile((id) => flatOrderRef.current.some((b) => b.id === id));
  });

  const registerFocusHandle = useCallback(
    (id: string, handle: BlockFocusHandle) =>
      authority.registerHandle(id, handle),
    [authority],
  );

  const setFlatOrder = useCallback((blocks: Block[]) => {
    flatOrderRef.current = blocks;
  }, []);

  const setRows = useCallback((blocks: Block[]) => {
    rowsRef.current = blocks;
  }, []);

  /**
   * Advance `rowsRef` to the rows a mutation THIS TURN just produced.
   *
   * `rowsRef` is refreshed by a consumer effect, i.e. once per React commit, so
   * two mutations issued in the same synchronous turn both snapshot the
   * PRE-first-mutation rows — and each writes its own full rows back. The second
   * then silently reasserts the first's columns: replaying a buffered `Tab` and
   * then the `* ` markdown prefix ran `indent` (an op) and `convertTo` (a patch)
   * in one turn, and the patch's upsert carried the pre-indent `parentId`,
   * un-indenting the block on the server. Captured as
   * `[PATCHDIAG] upserts=<item><-<page>` with no intervening commit.
   *
   * A human never noticed because React commits between their keystrokes; the
   * caret authority replays a whole buffer inside one turn, so a mutation now
   * routinely follows another with no commit in between. Every chokepoint that
   * computes an `after` publishes it here, so the next one in the same turn
   * builds on it. The consumer effect still overwrites this on the next commit
   * with the real (optimistically-overlaid) rows, so it can never drift.
   */
  const advanceRows = useCallback((after: Block[]) => {
    rowsRef.current = after;
  }, []);

  const requestBlockMenu = useCallback(
    (id: string) => setBlockMenuDraftId(id),
    [],
  );
  const clearBlockMenu = useCallback(
    (id?: string) =>
      setBlockMenuDraftId((cur) => (id == null || cur === id ? null : cur)),
    [],
  );

  const focusBlock = useCallback(
    (id: string, caretOffset?: number, opts?: CaretLandOptions) => {
      authority.land(id, (handle, land) => {
        // When a caret offset is requested and this block is a text editor, land
        // the caret precisely (the same leaf-aware placement `merge` uses); else a
        // plain focus restoring its last selection.
        if (caretOffset !== undefined && handle.focusOffset) {
          handle.focusOffset(caretOffset, { ...opts, ...land });
        } else handle.focus({ ...opts, ...land });
      });
    },
    [authority],
  );

  const focusBlockBoundary = useCallback(
    (id: string, edge: "start" | "end", opts?: CaretLandOptions): boolean =>
      // Boundary landings answer a question — "can this row take a caret?" — that
      // only a MOUNTED host can answer, and the empty-background click falls back
      // to selecting the row on `false`. So this never claims a flight.
      authority.landIfMounted(id, (handle, land) => {
        if (handle.focusBoundary)
          handle.focusBoundary(edge, { ...opts, ...land });
        else handle.focus({ ...opts, ...land });
      }),
    [authority],
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
          if (undoFocus)
            queueMicrotask(() =>
              focusBlock(undoFocus, undefined, { scroll: true }),
            );
        },
        redo: () => {
          dispatchPatch(redoPatch);
          if (redoFocus)
            queueMicrotask(() =>
              focusBlock(redoFocus, undefined, { scroll: true }),
            );
        },
      });
    },
    [record, dispatchPatch, focusBlock],
  );

  // Structural ops never coalesce (each is a distinct undo step), so this passes
  // no `coalesceKey` — preserving the previous `recordStructural` behavior exactly.
  const recordStructural = useCallback(
    (
      before: Block[],
      after: Block[],
      label: string,
      focusId: string | null,
    ) => {
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
      const derived = derivePatchEntry(
        before,
        after,
        focusId,
        undoTextOverride,
      );
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
          if (undoFocus)
            queueMicrotask(() =>
              focusBlock(undoFocus, undefined, { scroll: true }),
            );
        },
        redo: async () => {
          dispatchPatch(redoPatch);
          await docEdit?.redo();
          if (redoFocus)
            queueMicrotask(() =>
              focusBlock(redoFocus, undefined, { scroll: true }),
            );
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
          queueMicrotask(() =>
            focusBlock(blockId, undefined, { scroll: true }),
          );
        },
        redo: async () => {
          await edit.redo();
          queueMicrotask(() =>
            focusBlock(blockId, undefined, { scroll: true }),
          );
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
      const captured = captureBlockDocEdit(blockDocOwnerOf(blockId), edit);
      if (captured) recordTextEdit(blockId, captured, label);
    },
    [recordTextEdit],
  );

  // The row model's ONE text rule, enforced where every direct row write lands:
  //
  //     `data.text` is present on a row IFF its type accepts text.
  //
  // Both halves are a 400 at the write boundary otherwise — the key is
  // unrecognized on a void type's strict schema, and its ABSENCE is a missing
  // required field on a text-bearing one. Stating it here rather than at each
  // call site is the point: it used to live in `preserveText` alone, so
  // `projectText` (a writer that never calls through it) posted `text` at rows
  // it had just watched become dividers, and `convertTo` into a text type wrote
  // a row the server refused whole — losing the conversion.
  //
  // Writers state their intent; this is where that intent meets the row model.
  const conformRowText = useCallback(
    (row: Block): Block => {
      const handle = blockHandlesRef.current.get(row.type);
      // No registered handle, NO OPINION — deliberately NOT the same branch as a
      // void handle. A type can be missing because it was renamed or removed
      // while its rows live on, because this host mounted a subset of the block
      // plugins, or because the row belongs to another page in the composite
      // union. Stripping those rows' `text` would delete content; filling them
      // would invent the very key this exists to keep out. An unknown type still
      // reaches the write boundary and is still rejected there, loudly.
      if (!handle) return row;
      // `hasTextKey` / `rowDataOf` (`core/row-data.ts`) are the reader and the
      // stripper for exactly this key, so the branded blob is never widened with
      // a cast here. PRESENCE, not emptiness: `[]` is a legitimate value for a
      // text-bearing row, and the key itself is what either schema accepts or
      // rejects.
      const carries = hasTextKey(row.data);
      // `handle.text` is the declared text lens, present IFF the type is
      // text-bearing — the same fact `acceptsText` is derived from, and the same
      // discriminator `markdown-apply`'s `survivorData` uses for this rule on the
      // agent-facing write path.
      if (!handle.text) {
        return carries ? { ...row, data: rowDataOf(row.data) } : row;
      }
      return carries
        ? row
        : {
            ...row,
            data: {
              ...rowDataOf(row.data),
              text: handle.text(handle.empty?.() ?? {}),
            },
          };
    },
    [blockHandlesRef],
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
      // Conform only rows this write AUTHORED. `after` is the WHOLE row set —
      // over the composite host, the union of several pages — and every writer
      // here returns `b` unchanged for rows it did not touch, so identity is an
      // exact test. Conforming the rest would sweep an unrelated row into this
      // write's patch under this write's undo label, or (for `setExpanded`,
      // `record: false`) as an unrecorded, unundoable data write.
      //
      // `after` ONLY. `before` stays untouched, so `patchesFromDiff`'s undo
      // update restores the pre-conversion row WITH its `text`. Conforming
      // `before` too — or conforming inside `diffBlocks` — would make undo of a
      // text-to-void conversion restore a text row with no `text`, which the
      // write boundary rejects just as loudly in the other direction.
      const byId = new Map(before.map((b) => [b.id, b]));
      const after = transform(before).map((row) =>
        byId.get(row.id) === row ? row : conformRowText(row),
      );
      const { undo: undoPatch, redo: redoPatch } = patchesFromDiff(
        diffBlocks(before, after),
      );
      if (isEmptyPatch(undoPatch) && isEmptyPatch(redoPatch)) return;
      advanceRows(after);
      const { focusId } = opts;
      if (opts.record !== false) {
        record({
          label: opts.label,
          coalesceKey: opts.coalesceKey,
          undo: () => {
            dispatchPatch(undoPatch);
            // Undo/redo reveals the mutated block — it may be off-screen.
            if (focusId) {
              queueMicrotask(() =>
                focusBlock(focusId, opts.caretOffset, { scroll: true }),
              );
            }
          },
          redo: () => {
            dispatchPatch(redoPatch);
            if (focusId) {
              queueMicrotask(() =>
                focusBlock(focusId, opts.caretOffset, { scroll: true }),
              );
            }
          },
        });
      }
      dispatchPatch(redoPatch);
    },
    [
      record,
      dispatchPatch,
      focusBlock,
      liveRowsRef,
      advanceRows,
      conformRowText,
    ],
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
      commitRows(
        (rows) => rows.map((b) => (b.id === blockId ? transform(b) : b)),
        {
          ...opts,
          focusId: blockId,
        },
      );
    },
    [commitRows],
  );

  // `content doc → data.text` projection write (see the interface doc). NEVER
  // recorded: text history lives in the block's `Y.Doc` (wired into the
  // unified stack via `recordTextEdit`), so a projection landing on the undo
  // stack would double-count it. Still flows through the shared optimistic
  // patch pipeline (server write + `blocksChanged` fan-out) and no-ops when
  // the row is unchanged or gone.
  const projectText = useCallback<ProjectTextFn>(
    (blockId, runs) => {
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

  // See the interface doc: the ROW half of an edit whose history entry its own
  // surface already recorded. `preserveText` carries the row's `text`
  // projection across untouched, exactly as `update` does.
  const commitRecordedRowData = useCallback(
    (blockId: string, data: RowData) => {
      commitRow(blockId, (b) => ({ ...b, data: preserveText(b.data, data) }), {
        label: "Edit block",
        record: false,
      });
    },
    [commitRow],
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
      const { after, written, vars } = predictOp(op, before, opCtx);
      // An op the reducer fully refused (Tab on a first child, Shift+Tab at top
      // level, a bulk indent whose whole run is blocked) wrote no row. Drop it
      // here rather than dispatching: an empty-effect overlay would read as
      // already-absorbed to the apply-guard, and an empty patch pair would put a
      // do-nothing entry on the undo stack. `written`, not `vars.targets`: the
      // latter also carries the rows the op merely NAMES, so it is never empty.
      if (written.length === 0) return;
      advanceRows(after);
      recordStructural(
        before,
        after,
        OP_LABELS[op.kind],
        opFocusId(op, before),
      );
      store.dispatch(vars);
    },
    [store, recordStructural, opCtx, advanceRows],
  );

  // The three drag/selection writers are ORDINARY OPS, which is the whole point:
  // each is a `BlockOp` dispatched through `dispatchOp`, so it gets the
  // optimistic overlay, the undo entry, the empty-diff drop and — the reason
  // this stage exists — a place in the page's ordered write stream. Each used to
  // be a bespoke fire-and-forget POST outside all four.
  //
  // MUST stay below `dispatchOp` — they close over it, like `paste`.

  const bulkDelete = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      // ONE op, so one gesture is one undo entry and one server transaction
      // however many roots it names — never N single deletes.
      dispatchOp({ kind: "delete", blockIds: ids });
    },
    [dispatchOp],
  );

  const bulkMove = useCallback(
    (args: {
      ids: string[];
      parentId: string | null;
      afterId: string | null;
    }) => {
      if (args.ids.length === 0) return;
      dispatchOp({ kind: "bulkMove", ...args });
    },
    [dispatchOp],
  );

  const move = useCallback(
    (id: string, zone: "before" | "after", targetId: string) => {
      // POSITIONAL intent only. `resolveDropParent` is the rank-FREE half of
      // `computeDrop` on purpose: the op carries `(parentId, targetId, zone)` and
      // each side mints its own key from its own sibling set (see
      // `positionalRank`), so there is no rank for this layer to predict — and a
      // drop that changes nothing is dropped by `dispatchOp`'s empty-diff rule
      // rather than by a hand-rolled same-position check.
      const dest = resolveDropParent(rowsRef.current, id, zone, targetId);
      if (!dest) return;
      dispatchOp({
        kind: "move",
        blockId: id,
        parentId: dest.parentId,
        targetId,
        zone,
      });
    },
    [dispatchOp],
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
      // selection-driven op (the folds, `pasteAnchorId`) — `blockSelectionRoots`
      // preserves input-ARRAY order, which is nobody's order. Not load-bearing
      // for agreement: the array travels on the op, so both sides fold it
      // identically.
      const nodes = toNodes(before);
      const roots = inDocumentOrder(
        nodes,
        blockSelectionRoots(nodes, new Set(ids), isAnchorNode),
      );
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
    [dispatchOp, isAnchorNode],
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
      const { after, vars } = predictOp(op, before, opCtx);
      advanceRows(after);
      store.dispatch(vars);
      return { before, after };
    },
    [store, opCtx, advanceRows],
  );

  // Move the caret into a freshly-minted block by its known id. The block does
  // not exist yet — this runs in the same turn as the op that creates it — so
  // the authority CLAIMS the caret: it takes the keyboard and buffers what the
  // user types until the new editor's caret is ready. That claim is the whole
  // fix; without it every keystroke in the mount gap went to the origin block.
  const focusNew = useCallback(
    (id: string) => {
      // A freshly-created block (Enter / split / insert) is a scroll-wanted
      // landing: the new block may be below the fold, so reveal it.
      authority.land(id, (handle, land) =>
        handle.focus({ scroll: true, ...land }),
      );
    },
    [authority],
  );

  // Insert a new block at the end of the page. Top-level page content is
  // parented to the page block (`parentId: pageId`), since `computePageId(null)`
  // is null. Omitting `afterId` lets the reducer append it after the last
  // existing sibling under the page. The id is minted up front so focus does not
  // wait on the server round-trip.
  const insert = useCallback(
    (type: string, data: unknown) => {
      const newId = newBlockId();
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
      const newId = newBlockId();
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
      const containerId = newBlockId();
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
            // Born expanded, like every other created row: a container's stored
            // `expanded` is LIVE (it folds to its borrowed line), so a wrap that
            // minted `false` would hand the user a box that arrives folded.
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
      const target = prevVisibleLine(nodes, block, isAnchorNode);
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
      const targetHandle = authority.surgeryOf(target.id);
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
        const { after, vars } = predictOp(op, before, opCtx);
        queueMicrotask(() => {
          // `captureBlockDocEdit` runs `append` synchronously (surgery uses
          // `discrete: true`), so a throw propagates out of the microtask
          // BEFORE the dispatch — the source row is never removed.
          const docEdit = captureBlockDocEdit(blockDocOwnerOf(target.id), () =>
            append(mergingRuns),
          );
          store.dispatch(vars);
          recordStructuralWithDocEdit(
            before,
            after,
            OP_LABELS.merge,
            sourceId,
            docEdit,
            {
              blockId: sourceId,
              runs: mergingRuns,
            },
          );
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
        void appendRunsToBlockDoc(
          targetId,
          runsOfNode(target),
          mergingRuns,
        ).then(({ joinOffset }) => {
          const { before, after } = applyOverlay(op);
          const targetDataText = () =>
            (
              rowsRef.current.find((b) => b.id === targetId)?.data as Record<
                string,
                unknown
              > | null
            )?.text;
          const docEdit: CapturedBlockDocEdit = {
            undo: () =>
              truncateBlockDocFrom(targetId, targetDataText(), joinOffset),
            redo: async () => {
              await appendRunsToBlockDoc(
                targetId,
                targetDataText(),
                mergingRuns,
              );
            },
          };
          recordStructuralWithDocEdit(
            before,
            after,
            OP_LABELS.merge,
            sourceId,
            docEdit,
            {
              blockId: sourceId,
              runs: mergingRuns,
            },
          );
        });
      }
    },
    [
      store,
      applyOverlay,
      recordStructuralWithDocEdit,
      opCtx,
      isAnchorNode,
      authority,
    ],
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
          data: preserveText(b.data, data),
          expanded: expanded ?? b.expanded,
        }),
        { label: "Change block type" },
      );
    },
    [commitRow, blockHandles, wrapInContainer],
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
      //
      // Reached through the caret authority's `surgeryOf` seam, which hands back
      // content surgery and NOT `focus` — the registry itself is unreachable from
      // here on purpose, so no caller can place a caret behind the authority's back.
      authority.surgeryOf(blockId)?.deleteRange?.(from, to);
      // (2) The row. It states the TYPE and nothing about text: the stripped
      // content reaches `data.text` on its own, through the projection. Strictly
      // AFTER the strip — `/callout` must lose its `/callout` query from the
      // content doc before the block becomes a container's first child.
      convertRow(blockId, type, data, expanded);
    },
    [convertRow, authority],
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
          (b) => ({
            ...b,
            data: preserveText(b.data, data),
          }),
          { label: "Edit block", coalesceKey: blockId },
        );
      },
      setExpanded(expanded: boolean) {
        // Pure view state — deliberately NOT recorded into history (`record: false`):
        // Notion doesn't undo collapse/expand; it's not a document edit. Still flows
        // through the optimistic patch pipeline for snappiness, self-correcting on
        // re-click via the blocksResource push.
        commitRow(blockId, (b) => ({ ...b, expanded }), {
          label: "Toggle collapse",
          record: false,
        });
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
        const newId = newBlockId();
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
        const newId = newBlockId();
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
          const docEdit = captureBlockDocEdit(blockDocOwnerOf(blockId), () => {
            authority.surgeryOf(blockId)?.truncateAt?.(position);
          });
          recordStructuralWithDocEdit(
            before,
            after,
            OP_LABELS.split,
            newId,
            docEdit,
          );
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
        const next = nextVisibleLine(nodes, block, isAnchorNode);
        if (!next) return; // defensive: nothing below to pull up
        // Read the next block's LIVE runs from its registered handle — the
        // authoritative source (its `data.text` projection lags by up to ~1s, so
        // falling back to it would silently drop text just typed there, an
        // absorbed failure). Fall back to `runsOfNode` ONLY when the block has no
        // handle: a text-less block (divider/image/file/embed) registers none,
        // and its empty runs are the TRUE answer, not a lagged miss.
        const nextHandle = authority.surgeryOf(next.id);
        const runs = nextHandle?.readRuns
          ? nextHandle.readRuns()
          : runsOfNode(next);
        mergeBlock(next.id, runs);
      },
      remove() {
        dispatchOp({ kind: "delete", blockIds: [blockId] });
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
        while (j >= 0 && j < flat.length && !authority.hasHandle(flat[j]!.id)) {
          j += step;
        }
        const target = flat[j];
        // Keyboard cross-block navigation is scroll-wanted: the caret is moving
        // to a block the user may not be looking at, so follow it into view.
        if (target) {
          authority.landIfMounted(target.id, (handle, land) =>
            landCaret(handle, dir, caret, { scroll: true, ...land }),
          );
          return;
        }
        // Running off the block order is not a dead end: the host may render a
        // caret surface right before/after the list (the page title). Blocks and
        // host chrome land the caret through the exact same rules — the only
        // difference is that host chrome is not a block, so it is not the
        // authority's to hold.
        const surface: CaretSurface | null | undefined = (
          step < 0 ? caretBeforeRef.current : caretAfterRef.current
        )?.current;
        if (!surface) {
          // The outer edge of the caret space: no block that way, and no host
          // chrome beyond the list either. A VERTICAL arrow still means
          // something here — with no line below, "down" means the end of the
          // text, which is what a textarea, an `<input>` and every editor do on
          // the last line — so the caret collapses to this block's own far edge
          // instead of the press being swallowed. Horizontal arrows are left
          // alone: `nav left`/`nav right` are only ever resolved AT the block's
          // start/end, so there is no next character to move to, and Backspace
          // at the very start must not masquerade as a caret move.
          if (dir === "up" || dir === "down") {
            authority.landIfMounted(blockId, (handle, land) =>
              landCaretAtOwnEdge(handle, dir, { scroll: true, ...land }),
            );
          }
          return;
        }
        // Leaving the block list entirely: no block owns the caret anymore, so
        // drop the focused-block state (an empty block would otherwise keep
        // showing its "Type '/' for commands" placeholder while the caret sits
        // in the title). A block target sets it back through its own `onFocus`.
        setFocusedBlockId(null);
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
      isAnchorNode,
      authority,
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
      attachContainer: authority.attachContainer,
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
      commitRecordedRowData,
      recordTextEdit,
      recordDocEdit,
      undo,
      redo,
      canUndo,
      canRedo,
      blockMenuDraftId,
      requestBlockMenu,
      clearBlockMenu,
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
      authority,
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
      commitRecordedRowData,
      recordTextEdit,
      recordDocEdit,
      undo,
      redo,
      canUndo,
      canRedo,
      blockMenuDraftId,
      requestBlockMenu,
      clearBlockMenu,
    ],
  );

  return (
    <BlockEditorContext.Provider value={value}>
      {children}
    </BlockEditorContext.Provider>
  );
}
