import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { Doc, encodeStateAsUpdate, UndoManager } from "yjs";
import type { Provider } from "@lexical/yjs";
import { LinkNode } from "@lexical/link";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import {
  useEventCallback,
  useLatestRef,
} from "@plugins/primitives/plugins/latest-ref/web";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { editYDocState, yDocContent } from "@plugins/primitives/plugins/collab-doc/core";
import {
  blockContentResource,
  blockDocInit,
  blockDocUpdate,
} from "@plugins/page/plugins/editor-collab/core";
import { $appendRuns, runsOf, runsToXmlText, type RichText } from "../../core";
import {
  $paragraphsPlainLength,
  blockTextNodes,
  getBlockTextExtensions,
} from "./block-text-extensions";
import { $truncateFromLinearOffset } from "./collab-text-surgery";
import {
  base64ToBytes,
  IDLE_SAVE_STATE,
  LiveStateYjsProvider,
  type CollabSaveState,
} from "./live-state-yjs-provider";

/**
 * Per-block `{ doc, provider, undoManager }` registry + the `useCollabBlockDoc`
 * hook — THE single seam between the editor and the content-doc transport
 * (per-block CRDT plan, Stage 2). Everything transport- and undo-manager-shaped
 * lives behind this hook: a future delta-WS provider swaps in here and nothing
 * else in the editor changes. That includes "is this block's prose saved yet" —
 * the hook surfaces the provider's derived {@link CollabSaveState} rather than
 * handing the provider itself out, so the consumer reports to the sync-status
 * cloud without ever touching the transport.
 *
 * The registry is module-level and ref-counted per block id so React
 * strict-mode double-mounts and any second reader of the same block share ONE
 * `Y.Doc` (two docs for one block would fork the CRDT). Destruction is
 * deferred a macrotask: strict-mode releases and re-acquires synchronously
 * within one commit, and `CollaborationPlugin` does not re-call its
 * providerFactory on the simulated remount — an immediate destroy would pull
 * the doc out from under the binding it still holds.
 *
 * ## Undo (Stage 3b)
 *
 * Each entry owns a `Y.UndoManager` over the doc's content root, tracking ONLY
 * local-edit origins: origins are learned dynamically on `beforeTransaction` —
 * anything that is not the provider (server-applied states) and not an
 * `UndoManager` (undo/redo replays) is a local editing source (in practice
 * exactly the `@lexical/yjs` binding, which transacts with itself as origin).
 * Remote/echoed applies therefore never enter a block's undo history, and the
 * manager's own undo/redo transactions never re-capture.
 *
 * The manager does the COALESCING (its `captureTimeout` folds a typing run
 * into one stack item); every NEW item is surfaced to the mounted consumer via
 * `onUndoableEdit` so it can be recorded 1:1 onto the app's single document-
 * level undo stack. That 1:1 correspondence is what makes the generic
 * `um.undo()` thunk correct: entries referencing one block's manager are
 * recorded in item order, and the shared stack is LIFO, so when an entry is
 * popped all later entries for that block were popped first — the manager's
 * top item IS the entry's item. `captureBlockDocEdit` (split/merge) keeps the
 * correspondence by folding its item into the caller's combined entry instead
 * of surfacing it.
 *
 * `CollaborationPlugin`'s own forced per-block `UndoManager` stays inert: its
 * UNDO/REDO commands are swallowed (collab-text-plugin) and this manager's
 * replay transactions don't match its tracked origins.
 */

/**
 * `Y.UndoManager` captureTimeout — the text-coalescing window. Matches the
 * shared stack's intent (a typing run = one undo step) at the same 500ms the
 * app's coalescing uses; grouping happens HERE (one stack item per run), never
 * via the shared stack's `coalesceKey` (see `recordTextEdit`).
 */
const UNDO_CAPTURE_TIMEOUT_MS = 500;

/**
 * One reversible content-doc edit, shaped like the app's `HistoryEntry`
 * thunks. Bound to the registry entry that captured it: if the block's doc was
 * destroyed (block deleted / editor released) — and possibly re-created — the
 * thunks no-op rather than popping a fresh manager's unrelated items.
 */
export interface CapturedBlockDocEdit {
  undo: () => void | Promise<void>;
  redo: () => void | Promise<void>;
}

interface CollabDocEntry {
  blockId: string;
  doc: Doc;
  provider: LiveStateYjsProvider;
  um: UndoManager;
  /** Raised by `captureBlockDocEdit` so folded edits skip `onUndoableEdit`. */
  suppressUndoCapture: boolean;
  undoCaptureListeners: Set<(edit: CapturedBlockDocEdit) => void>;
  refs: number;
  destroyTimer: ReturnType<typeof setTimeout> | null;
}

const registry = new Map<string, CollabDocEntry>();

/**
 * Deterministic Yjs clientID for a seed doc, keyed on BOTH the runs content
 * AND the active extension set (FNV-1a over the canonical runs JSON plus a
 * canonical extension-id fingerprint, NUL-separated) — matching the
 * determinism contract on `RunsXmlTextOptions.clientID` in `core/runs-yjs.ts`.
 * Identical runs AND identical extension set → identical clientID → (with the
 * sequential single-client construction in `runsToXmlText`) byte-identical seed
 * encodings, so replicas seeding the same block independently converge by no-op
 * merge — which is what makes the provider's INSTANT local pre-seed safe
 * (Stage 4a). Folding the extension set in closes the mid-rollout hazard: two
 * replicas with DIFFERENT extension sets seeding the same block produce
 * structurally-different seed bytes, so they MUST NOT share a clientID (that
 * would collide item ids and corrupt). Different runs OR a mismatched extension
 * set now yields a different clientID, so a divergent seed can only ever
 * DUPLICATE (plain CRDT merge), never corrupt by colliding item ids.
 */
function seedClientID(runsJson: string, extIds: string): number {
  let h = 0x811c9dc5;
  const fold = (s: string): void => {
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
  };
  fold(runsJson);
  fold("\0"); // separator that can't appear inside a run-string collision
  fold(extIds);
  return h >>> 0;
}

/** Build deterministic seed-state bytes for `dataText` (see {@link seedClientID}). */
function buildSeedStateFor(dataText: unknown): Uint8Array {
  const runs = runsOf(dataText);
  const extensions = getBlockTextExtensions();
  // Canonical fingerprint of the active extension set: sorted ids, so the
  // clientID keys on the set's identity independent of registration order.
  const extIds = [...extensions].map((e) => e.id).sort().join(",");
  const xmlText = runsToXmlText(runs, {
    extensions,
    nodes: blockTextNodes(),
    clientID: seedClientID(JSON.stringify(runs), extIds),
  });
  const seedDoc = xmlText.doc;
  if (!seedDoc) {
    throw new Error("buildSeedStateFor: seed XmlText is not attached to a doc");
  }
  return encodeStateAsUpdate(seedDoc);
}

/**
 * Thunks popping `count` items off `entry`'s undo manager (LIFO — see the
 * module comment for why "pop top" is the right item when the shared stack
 * reaches the corresponding entry). Generation-guarded: a destroyed (or
 * destroyed-and-recreated) entry makes them a deliberate no-op — the recreated
 * doc's manager is empty or holds OTHER edits, never this one.
 */
function makeEntryDocEdit(entry: CollabDocEntry, count: number): CapturedBlockDocEdit {
  const live = (): CollabDocEntry | null =>
    registry.get(entry.blockId) === entry ? entry : null;
  return {
    undo: () => {
      const e = live();
      if (!e) return;
      for (let i = 0; i < count; i++) e.um.undo();
    },
    redo: () => {
      const e = live();
      if (!e) return;
      for (let i = 0; i < count; i++) e.um.redo();
    },
  };
}

/**
 * Take one ref-counted hold on the block's shared `{ doc, provider, um }`
 * entry, creating it on first acquire. Plugin-internal (exported for the
 * registry lifecycle tests and any non-hook consumer inside the editor);
 * every acquire must be paired with a {@link releaseCollabDoc}.
 */
export function acquireCollabDoc(
  blockId: string,
  buildSeedState: () => Uint8Array,
  rowConfirmed: boolean,
): CollabDocEntry {
  let entry = registry.get(blockId);
  if (!entry) {
    const doc = new Doc();
    // `rowConfirmed` is the consumer's RENDER-TIME view (see useCollabBlockDoc)
    // — construction-accurate, so connect()'s pre-seed discriminator never
    // depends on the later `markBlockRowConfirmed` parent effect having run.
    const provider = new LiveStateYjsProvider(doc, blockId, buildSeedState, rowConfirmed);
    const um = new UndoManager(yDocContent(doc), {
      captureTimeout: UNDO_CAPTURE_TIMEOUT_MS,
      // Local-edit origins are learned below; yjs adds the manager itself so
      // its own replays capture onto the opposite stack (undo ⇄ redo).
      trackedOrigins: new Set(),
    });
    // Learn local-edit origins dynamically (the `@lexical/yjs` binding is not
    // reachable from here — CollaborationPlugin keeps it private). Everything
    // that is not the transport (provider origin = server-applied state) and
    // not an undo-manager replay is by construction a local editing source.
    // `beforeTransaction` fires before the manager's afterTransaction capture,
    // so even the first-ever local edit is tracked.
    doc.on("beforeTransaction", (tr) => {
      const origin: unknown = tr.origin;
      if (origin != null && origin !== provider && !(origin instanceof UndoManager)) {
        um.addTrackedOrigin(origin);
      }
    });
    const created: CollabDocEntry = {
      blockId,
      doc,
      provider,
      um,
      suppressUndoCapture: false,
      undoCaptureListeners: new Set(),
      refs: 0,
      destroyTimer: null,
    };
    // Mirror each NEW undo stack item (= one coalesced local editing run) to
    // the mounted consumer. Filters: `type !== "undo"` is the manager pushing
    // a redo item during its own undo(); `origin === um` is the manager
    // re-pushing an undo item during its own redo() — neither is a fresh edit.
    // Merges into an existing item (within captureTimeout) fire
    // `stack-item-updated`, not this event, so a typing run surfaces once.
    um.on("stack-item-added", (event) => {
      if (event.type !== "undo" || event.origin === um) return;
      if (created.suppressUndoCapture) return;
      const edit = makeEntryDocEdit(created, 1);
      for (const cb of [...created.undoCaptureListeners]) cb(edit);
    });
    registry.set(blockId, created);
    entry = created;
  }
  entry.refs += 1;
  if (entry.destroyTimer !== null) {
    clearTimeout(entry.destroyTimer);
    entry.destroyTimer = null;
  }
  return entry;
}

/**
 * Run `edit` (which must drive its Lexical/Yjs changes SYNCHRONOUSLY — the
 * live-editor surgery helpers pass `discrete: true` for exactly this) as an
 * explicit capture boundary on the block's undo manager, WITHOUT surfacing it
 * through `onUndoableEdit`. Returns thunks reversing/re-applying exactly the
 * captured item(s), or `null` when the edit changed nothing — the split/merge
 * building block that folds a content-doc edit into ONE combined stack entry
 * with its structural patch (Stage 3b).
 *
 * `stopCapturing` on both sides pins the boundary: the edit can't merge into a
 * preceding typing run's item, and subsequent typing can't merge into the
 * captured item (which the combined entry now owns).
 */
export function captureBlockDocEdit(
  blockId: string,
  edit: () => void,
): CapturedBlockDocEdit | null {
  const entry = registry.get(blockId);
  if (!entry) {
    // No live doc (editor not mounted) — nothing to capture; the caller's
    // structural entry stands alone.
    edit();
    return null;
  }
  entry.um.stopCapturing();
  const before = entry.um.undoStack.length;
  entry.suppressUndoCapture = true;
  try {
    edit();
  } finally {
    entry.suppressUndoCapture = false;
    entry.um.stopCapturing();
  }
  const count = entry.um.undoStack.length - before;
  return count > 0 ? makeEntryDocEdit(entry, count) : null;
}

/**
 * Destroy `entry` if it is still the registry's live entry, unreferenced, AND
 * its provider has nothing buffered that a reconnect could still save.
 * Otherwise the entry is RETAINED (teardown-flush safety): an ordinary
 * unmount coinciding with a transient outage leaves the eager disconnect
 * flush re-queued — destroying then would drop the user's last edits even
 * though the tab lives and will reconnect. The provider's ws-reopen/`online`
 * listeners stay subscribed until destroy, so the retained queue drains
 * push-based; the provider then invokes this again via its (single-slot)
 * teardown-ready listener. Truly destroyed once flushed or the block is
 * server-confirmed gone — never on a timer, never by dropping bytes.
 */
function finalizeEntry(entry: CollabDocEntry): void {
  if (entry.refs > 0) return;
  if (registry.get(entry.blockId) !== entry) return; // already finalized/replaced
  if (!entry.provider.readyForTeardown) {
    entry.provider.setTeardownReadyListener(() => finalizeEntry(entry));
    return;
  }
  registry.delete(entry.blockId);
  entry.provider.destroy();
  entry.doc.destroy();
}

export function releaseCollabDoc(blockId: string): void {
  const entry = registry.get(blockId);
  if (!entry) return;
  entry.refs -= 1;
  if (entry.refs > 0) return;
  // Deferred destroy (see module comment): canceled if re-acquired first.
  entry.destroyTimer = setTimeout(() => {
    entry.destroyTimer = null;
    finalizeEntry(entry); // flushes/retains pending local edits (see above)
  }, 0);
}

export type CollabProviderFactory = (
  id: string,
  yjsDocMap: Map<string, Doc>,
) => Provider;

/** What {@link useCollabBlockDoc} hands its consumer. */
export interface CollabBlockDoc {
  /** For `CollaborationPlugin`'s `providerFactory` prop. */
  providerFactory: CollabProviderFactory;
  /**
   * The block's prose durability, straight off the provider (`useSyncExternalStore`).
   * Report it to the surface's sync-status cloud — the transport is the only
   * thing that knows whether the bytes landed.
   */
  saveState: CollabSaveState;
  /** Re-run a save the user retried. Only meaningful while `saveState.phase === "error"`. */
  retrySave: () => void;
}

/**
 * Bind a block to its shared per-block content doc. Returns the
 * `providerFactory` for `CollaborationPlugin` (pass `id={blockId}` and
 * `shouldBootstrap={false}` — the doc is seeded server-side, never
 * bootstrapped by Lexical) plus this block's live save state.
 *
 * `dataText` (the block's `data.text`) is only ever read when the block has no
 * stored content doc yet: the first opener builds a throwaway seed from it via
 * the SAME runs↔XmlText bridge the rest of the system uses (registered token
 * extensions + decorator node classes), POSTs it to the first-writer-wins
 * doc-init endpoint, and the live doc is hydrated exclusively from the
 * server's authoritative response.
 *
 * `rowConfirmed` (Stage 4a) is the doc-init FK gate: pass true once the block
 * id is present in AUTHORITATIVE (server-truth, not optimistic-overlay) blocks
 * data. A freshly created / split block mounts from the overlay before its
 * `_blocks` row exists server-side; seeding then would FK-violate. The gate
 * lifts push-based — the same blocks push that confirms the row re-renders the
 * consumer with `rowConfirmed = true`, and the effect below unlatches the
 * provider. Local edits made in the gap buffer in the doc and flush after the
 * seed completes.
 *
 * The RENDER-TIME value additionally seeds the provider's construction (via
 * `acquireCollabDoc`): connect()'s instant pre-seed discriminator must be
 * accurate at the first connect — which may run before any of this hook's
 * effects — so an existing block (confirmed from its very first render) can
 * never pre-apply a `data.text` seed over its stored doc (the reopen
 * text-duplication hazard), while a client-minted block still hydrates
 * instantly.
 *
 * `onContentChange` (optional) fires on EVERY doc update — local edits and
 * applied server states alike — so the caller can project the doc's content
 * back to `data.text` (Stage 3a). It is invoked raw (no debounce); pass a
 * stable callback (`useEventCallback`) and debounce in the consumer.
 *
 * `onUndoableEdit` (optional, Stage 3b) fires once per NEW coalesced local
 * editing run (a fresh `Y.UndoManager` stack item — remote applies, undo/redo
 * replays, and `captureBlockDocEdit`-folded edits excluded) with thunks that
 * reverse/re-apply exactly that run, for recording onto the app's unified
 * undo stack. Pass a stable callback (`useEventCallback`).
 */
export function useCollabBlockDoc(
  blockId: string,
  dataText: unknown,
  rowConfirmed: boolean,
  onContentChange?: () => void,
  onUndoableEdit?: (edit: CapturedBlockDocEdit) => void,
): CollabBlockDoc {
  const dataTextRef = useLatestRef(dataText);
  // Render-accurate row-confirmed view for provider CONSTRUCTION (the
  // pre-seed discriminator): an existing block renders with `rowConfirmed`
  // already true (it only renders because it is in the authoritative rows),
  // a freshly split/inserted block with false. `useLatestRef` writes during
  // render, so every `ensure()` call site (all effects) reads the value of
  // the commit it runs in — never a stale default the later latch effect
  // would have to correct after connect() already pre-seeded.
  const rowConfirmedRef = useLatestRef(rowConfirmed);

  const buildSeedState = useEventCallback((): Uint8Array =>
    buildSeedStateFor(dataTextRef.current),
  );

  // One hold per hook instance. Acquired lazily from whichever consumer runs
  // first (the providerFactory call or the subscription effect below) — both
  // run in effects, so a discarded render never leaks a ref-count.
  //
  // `id` is a PARAMETER, not a captured `blockId`: `ensure` is a stable
  // `useEventCallback`, so every caller's dependence on the block id would
  // otherwise be invisible — to a reader and to `exhaustive-deps` alike.
  const heldRef = useRef<CollabDocEntry | null>(null);
  const ensure = useEventCallback((id: string): CollabDocEntry => {
    if (heldRef.current && heldRef.current.blockId !== id) {
      releaseCollabDoc(heldRef.current.blockId);
      heldRef.current = null;
    }
    heldRef.current ??= acquireCollabDoc(id, buildSeedState, rowConfirmedRef.current);
    return heldRef.current;
  });

  useEffect(() => {
    return () => {
      if (heldRef.current) {
        releaseCollabDoc(heldRef.current.blockId);
        heldRef.current = null;
      }
    };
  }, [blockId]);

  // Doc-init FK gate (Stage 4a): unlatch the provider once the block's row is
  // server-confirmed. One-way — the provider ignores repeats — and push-based:
  // this effect re-fires on the authoritative blocks push that flips
  // `rowConfirmed` true.
  useEffect(() => {
    if (rowConfirmed) ensure(blockId).provider.markBlockRowConfirmed();
  }, [blockId, rowConfirmed, ensure]);

  // Doc-content observer for the projection consumer. `doc.on("update")` fires
  // once per transaction for local AND server-applied changes; a plain notify
  // (no payload) keeps this hook content-agnostic.
  useEffect(() => {
    if (!onContentChange) return;
    const doc = ensure(blockId).doc;
    const notify = () => onContentChange();
    doc.on("update", notify);
    return () => doc.off("update", notify);
  }, [blockId, onContentChange, ensure]);

  // Undo-capture observer (Stage 3b): surface each new coalesced local editing
  // run to the consumer so it can be recorded onto the unified undo stack.
  useEffect(() => {
    if (!onUndoableEdit) return;
    const entry = ensure(blockId);
    entry.undoCaptureListeners.add(onUndoableEdit);
    return () => {
      entry.undoCaptureListeners.delete(onUndoableEdit);
    };
  }, [blockId, onUndoableEdit, ensure]);

  // IN: the per-block live subscription. Subscribing only while a block editor
  // is mounted is the lazy content-loading win; each pushed value flows into
  // the provider, which merges it (idempotently) into the shared doc.
  const params = useMemo(() => ({ blockId }), [blockId]);
  const contentRes = useResource(blockContentResource, params);
  useEffect(() => {
    // While loading we can't tell "absent" (→ seed) from "not arrived yet",
    // so nothing is delivered until the subscription settles.
    if (contentRes.pending) return;
    ensure(blockId).provider.onServerState(contentRes.data[0]?.state ?? null);
    // `contentRes` identity recomputes only on pending/data/error (structural
    // sharing in useResource), so this fires once per actual server change.
  }, [blockId, contentRes, ensure]);

  // OUT (observability): the provider's derived save state, for the surface's
  // sync-status cloud. Keyed on `blockId` so a re-keyed hook resubscribes to the
  // NEW provider's listener set instead of staying bound to the old entry's.
  // `getSnapshot` tolerates "no entry yet" (a first render, before any effect
  // has called `ensure()`): nothing has been typed, so nothing can be unsaved.
  // The provider memoizes its snapshot, so this can't loop.
  const subscribeSaveState = useCallback(
    (onStoreChange: () => void) => ensure(blockId).provider.onSaveState(onStoreChange),
    [blockId, ensure],
  );
  const getSaveState = useCallback(
    (): CollabSaveState => heldRef.current?.provider.getSaveState() ?? IDLE_SAVE_STATE,
    [],
  );
  const saveState = useSyncExternalStore(subscribeSaveState, getSaveState);
  const retrySave = useEventCallback((): void => {
    heldRef.current?.provider.retryFlush();
  });

  const providerFactory = useEventCallback(
    (id: string, yjsDocMap: Map<string, Doc>): Provider => {
      if (id !== blockId) {
        throw new Error(
          `useCollabBlockDoc: providerFactory id "${id}" != block id "${blockId}"`,
        );
      }
      const entry = ensure(blockId);
      // CollaborationPlugin reads the doc back out of the map it hands us.
      yjsDocMap.set(id, entry.doc);
      return entry.provider;
    },
  );

  return { providerFactory, saveState, retrySave };
}

/**
 * Doc-level append for a block with NO mounted editor (the offscreen-merge
 * fallback, Stage 3a): when a Backspace-merge targets a block whose editor
 * isn't mounted (virtualized offscreen), we can't drive its Lexical instance —
 * so we edit its content doc directly, losslessly:
 *
 *  1. `doc-init` with a seed built from the block's current `data.text` —
 *     first-writer-wins, so the response is the authoritative stored state
 *     (the existing doc when one exists; our seed only for a never-opened
 *     block, where `data.text` IS the truth).
 *  2. Replay that state headless and append `runs` through the SAME Lexical
 *     walk the live editor uses (`editYDocState` + `$appendRuns` — marks +
 *     decorator tokens preserved), yielding an incremental update.
 *  3. `doc-update` merges it server-side; any live subscriber (including a
 *     registry entry that mounts meanwhile) converges via the resource push.
 *
 * Returns the JOIN offset (the content's plain length before the append) so
 * the merge's undo entry can reverse the append via
 * {@link truncateBlockDocFrom} (Stage 3b).
 *
 * No `rowConfirmed` gate here: the target of an offscreen merge is by
 * construction a long-existing block (it scrolled out of the viewport). If it
 * were somehow not yet server-real, doc-init 404s cleanly, this rejects
 * loudly, and the caller's structural delete never fires — both blocks intact.
 */
export async function appendRunsToBlockDoc(
  blockId: string,
  dataText: unknown,
  runs: RichText,
): Promise<{ joinOffset: number }> {
  const extensions = getBlockTextExtensions();
  const nodes = blockTextNodes();
  const { state } = await fetchEndpoint(
    blockDocInit,
    { id: blockId },
    { body: new Blob([buildSeedStateFor(dataText) as BlobPart]) },
  );
  let joinOffset = 0;
  const update = editYDocState(
    base64ToBytes(state),
    () => {
      joinOffset = $paragraphsPlainLength();
      $appendRuns(runs, extensions);
    },
    { nodes: [LinkNode, ...nodes] },
  );
  await fetchEndpoint(
    blockDocUpdate,
    { id: blockId },
    { body: new Blob([update as BlobPart]) },
  );
  return { joinOffset };
}

/**
 * Doc-level truncation for a block with NO mounted editor — the inverse of
 * {@link appendRunsToBlockDoc}, used by the offscreen-merge UNDO thunk
 * (Stage 3b): delete the target doc's content from linear `offset` to the end,
 * losslessly, via the same three-step shape (authoritative state via doc-init,
 * headless Lexical edit, incremental doc-update). Position-based rather than
 * CRDT-relative — acceptable because the shared stack is LIFO, so any later
 * edits to the same block were undone (and flushed) before this runs.
 *
 * FRAGILITY: the cut is a position, not a CRDT-relative anchor, so it is safe
 * ONLY under single-client LIFO. A concurrent append PAST `offset` landing
 * between the merge and this undo would be silently deleted — a cross-client
 * lost write. Dormant today: this offscreen path runs only when the target
 * editor is UNMOUNTED, which needs virtualization the page editor does not do
 * (so single-client LIFO holds and nothing writes past `offset` here). The
 * trigger that would require a CRDT-relative rewrite is a virtualized +
 * multi-writer (my-devices + agents) target — see the residual-edge note.
 */
export async function truncateBlockDocFrom(
  blockId: string,
  dataText: unknown,
  offset: number,
): Promise<void> {
  const nodes = blockTextNodes();
  const { state } = await fetchEndpoint(
    blockDocInit,
    { id: blockId },
    { body: new Blob([buildSeedStateFor(dataText) as BlobPart]) },
  );
  const update = editYDocState(
    base64ToBytes(state),
    () => $truncateFromLinearOffset(offset),
    { nodes: [LinkNode, ...nodes] },
  );
  await fetchEndpoint(
    blockDocUpdate,
    { id: blockId },
    { body: new Blob([update as BlobPart]) },
  );
}
