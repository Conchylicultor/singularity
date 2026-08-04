import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Doc, encodeStateAsUpdate } from "yjs";
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
import {
  $appendRuns,
  coalesce,
  runsOf,
  runsToXmlText,
  xmlTextContentLength,
  type RichText,
} from "../../core";
import {
  $paragraphsPlainLength,
  blockTextNodes,
  blockTextRunsOptions,
  getBlockTextExtensions,
} from "./block-text-extensions";
import { projectableRunsOf, type ProjectTextFn } from "./doc-sourced-runs";
import { $truncateFromLinearOffset } from "./collab-text-surgery";
import {
  base64ToBytes,
  IDLE_SAVE_STATE,
  type CollabSaveState,
} from "./live-state-yjs-provider";
import type { BindingReplica } from "./binding-replica";
import {
  ATTACHING_STATE,
  CollabSession,
  type CapturedBlockDocEdit,
  type SessionState,
} from "./collab-session";

/**
 * The `useCollabBlockDoc` hook — THE single seam between the editor and the
 * content-doc transport (per-block CRDT plan, Stage 2). Everything transport-
 * and undo-manager-shaped lives behind this hook: a future delta-WS provider
 * swaps in here and nothing else in the editor changes. That includes "is this
 * block's prose saved yet" — the hook surfaces the provider's derived
 * {@link CollabSaveState} rather than handing the provider itself out, so the
 * consumer reports to the sync-status cloud without ever touching the
 * transport.
 *
 * ## Who owns what
 *
 * Ownership and lifetime live next door in `collab-session.ts` — read its
 * module comment first; this file is the React surface over it.
 *
 * - a **`BlockDocOwner`** per block id (module registry): the canonical
 *   `Y.Doc`, the transport provider, the `Y.UndoManager`. Two docs for one
 *   block would fork the CRDT, and four consumers need the union across every
 *   mounted binding.
 * - a **`CollabSession`** per (block, binding) — one per hook instance. It
 *   holds the owner BY REFERENCE (never by id), mints the per-binding
 *   {@link BindingReplica} `providerFactory` hands `CollaborationPlugin`, and
 *   owns the ONE deferred retention that covers StrictMode remounts, a binding
 *   that has not let go of its replica yet, and the provider's buffered-bytes
 *   teardown retention.
 *
 * What stays HERE is everything that needs React or the block's row: the
 * `data.text` seed builder, the render-accurate `rowConfirmed` value, the
 * subscription/FK-gate effects, the save-state store, and the
 * `content doc → data.text` projection (whose final flush must run inside this
 * hook's teardown, before the session ends).
 *
 * ## Per-binding replicas
 *
 * The Lexical binding does NOT attach to the shared canonical doc: each
 * session owns one {@link BindingReplica} — a fresh per-binding `Y.Doc` kept in
 * sync with the canonical by a bidirectional synchronous relay — and
 * `providerFactory` hands `CollaborationPlugin` THAT doc + provider. The
 * invariant (see `binding-replica.ts`): a binding always attaches to an empty
 * doc and receives ALL content as post-attach update events, so a second
 * simultaneous editor of the same block (inline nested-page expansion + the
 * page's detail pane) hydrates instead of rendering empty forever. Everything
 * else stays canonical-side, where all edits land synchronously via the relay:
 * the transport provider (and its save state), the `Y.UndoManager`,
 * `captureBlockDocEdit`, the doc observers below, and the offscreen doc-level
 * helpers. Since CollaborationPlugin connects the replica, the replica
 * delegates connect/disconnect to the transport, refcounted per owner
 * (`replicaConnection`) — the transport HOLDS a delivered server state until
 * its connect(), so an unconnected transport would leave every block empty.
 *
 * ## Undo (Stage 3b)
 *
 * The owner owns a `Y.UndoManager` over the doc's content root, tracking ONLY
 * local-edit origins (learned dynamically — see `collab-session.ts`). The
 * manager does the COALESCING (its `captureTimeout` folds a typing run into
 * one stack item); every NEW item is surfaced to the mounted consumer via
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
 * Debounce for the `content doc → data.text` projection write. Heavy on
 * purpose: rows only need to trail the doc closely enough for search /
 * backlinks / history — sub-second staleness is fine, and a long window keeps
 * `blocksChanged` fan-out bounded during a typing run.
 */
const PROJECT_DEBOUNCE_MS = 1000;

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
  // The SAME option set the doc-sourced projection reads back with — a seed
  // written under one extension set and read under another loses its decorator
  // tokens (see `blockTextRunsOptions`).
  const opts = blockTextRunsOptions();
  // Canonical fingerprint of the active extension set: sorted ids, so the
  // clientID keys on the set's identity independent of registration order.
  const extIds = [...opts.extensions].map((e) => e.id).sort().join(",");
  const xmlText = runsToXmlText(runs, {
    ...opts,
    clientID: seedClientID(JSON.stringify(runs), extIds),
  });
  const seedDoc = xmlText.doc;
  if (!seedDoc) {
    throw new Error("buildSeedStateFor: seed XmlText is not attached to a doc");
  }
  return encodeStateAsUpdate(seedDoc);
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
   * Bump this on the mounted `CollaborationPlugin`'s `key`. It changes only
   * when {@link rehydrate} runs, and a changed key is what actually re-attaches
   * the binding (Lexical builds its binding once per mount, behind a ref).
   */
  attachGeneration: number;
  /**
   * Live plain-text length of the CANONICAL doc — what this block's content
   * REALLY is, independent of what any binding managed to render. Half of the
   * hydration guard's comparison; the other half is the consumer's own
   * serialization of the editor.
   */
  docContentLength: () => number;
  /** Whether any local edit ever entered this doc (starvation discriminator). */
  hasLocalEdits: () => boolean;
  /**
   * Subscribe to every CANONICAL-doc update — local edits and applied server
   * states alike, one call per integrating transaction. The push-based trigger
   * for anything that must react to "this block's content moved" (today: the
   * consumer's blind-binding check). The projection has its own arming inside
   * the seam; this is the outward-facing seam of the same signal.
   */
  subscribeDocUpdates: (cb: () => void) => () => void;
  /**
   * Recover a block whose rendered text no longer agrees with its doc or with
   * the server: END this block's content session and start a new one. A new
   * session IS a fresh empty replica (the binding-behind-its-doc half) plus an
   * authoritative re-read (the doc-behind-the-server half), so the caller never
   * decides which side was short — see `collab-session.ts` and
   * `collab-text-plugin`'s guard.
   */
  rehydrate: () => void;
  /**
   * This binding's hydration state (stage 4) — where the session is between
   * "the replica exists" and "what the user sees provably equals what that
   * replica holds". Reactive; see `collab-session.ts` for the machine.
   *
   * Consumers use it for the PLACEHOLDER and the stalled Retry only. The write
   * gate it implies (the projection and the transport flush) is enforced inside
   * the seam and the transport, not by whoever renders this.
   */
  hydration: SessionState;
  /**
   * Report what the binding renders, in the Yjs basis
   * (`$xmlBasisContentLength`), at a `COLLABORATION_TAG` commit — the ONLY
   * thing that can promote `hydrating` to `hydrated`. `promoteOnly` is for a
   * listener that may have registered LATE (a commit already fired): it may
   * confirm agreement, never conclude disagreement.
   */
  verifyRendered: (shownLength: number, promoteOnly?: boolean) => void;
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
 * The RENDER-TIME value additionally seeds the provider's construction (the
 * first session over a block mints its owner): connect()'s instant pre-seed
 * discriminator must be accurate at the first connect — which may run before
 * any of this hook's effects — so an existing block (confirmed from its very
 * first render) can never pre-apply a `data.text` seed over its stored doc (the
 * reopen text-duplication hazard), while a client-minted block still hydrates
 * instantly.
 *
 * `projectText` is the row writer the seam-owned `content doc → data.text`
 * projection dispatches through. The projection itself lives HERE, not in the
 * consumer: its value is read out of the canonical doc, so it needs no editor —
 * and its final flush must run inside this hook's teardown, before the session
 * ends. Its argument is branded `DocSourcedRuns`, which only
 * `projectableRunsOf` can mint, so a future consumer cannot re-route a
 * view-sourced value through it.
 *
 * `onUndoableEdit` (optional, Stage 3b) fires once per NEW coalesced local
 * editing run (a fresh `Y.UndoManager` stack item — remote applies, undo/redo
 * replays, and `captureBlockDocEdit`-folded edits excluded) with thunks that
 * reverse/re-apply exactly that run, for recording onto the app's unified
 * undo stack. Pass a stable callback (`useEventCallback`).
 */
/** A hook instance's {@link CollabSession} handle (both doc hooks). */
interface CollabDocHold {
  /**
   * The live session for `id`, starting one on first call and RETAINING it
   * (cancelling a pending end) on every later one — the remount-in-place path.
   * Safe to call from effects.
   */
  ensure: (id: string) => CollabSession;
  /** The current live session, WITHOUT starting one. Null before first `ensure`. */
  peek: () => CollabSession | null;
  /**
   * End the current session and start its successor over the same owner: THE
   * recovery verb (see {@link CollabBlockDoc.rehydrate} and
   * `collab-session.ts`). Returns false when there is no live session to
   * recover — nothing is mounted, so there is nothing that could be behind.
   */
  restartSession: () => boolean;
  /**
   * The session's per-binding {@link BindingReplica} over `id`'s owner, minted
   * lazily on first call (the providerFactory call). One replica per session.
   */
  ensureReplica: (id: string) => BindingReplica;
  /**
   * Mark the block's row stale and arm ONE trailing projection window. Wired to
   * the canonical doc's `update` event; see {@link useCollabDocHold}.
   */
  armProjection: () => void;
  /** Subscribe to canonical-doc updates (see {@link CollabBlockDoc.subscribeDocUpdates}). */
  subscribeDocUpdates: (cb: () => void) => () => void;
  /**
   * The live session's hydration state, or {@link ATTACHING_STATE} before one
   * exists. A `useSyncExternalStore` pair whose subscription survives session
   * churn: {@link CollabDocHold.ensure} / {@link CollabDocHold.restartSession}
   * re-point ONE forwarding listener at the new session, so a consumer never
   * re-subscribes and never misses a transition across a `rehydrate()`.
   */
  hydrationState: () => SessionState;
  subscribeHydration: (cb: () => void) => () => void;
  /** {@link CollabSession.verifyRendered} against the live session, if any. */
  verifyRendered: (shownLength: number, promoteOnly?: boolean) => void;
}

/**
 * Shared per-hook session handle (both doc hooks). Owns the `data.text` seed
 * builder, the render-accurate `rowConfirmed` construction value, the one
 * session and its unmount end — and the `content doc → data.text` PROJECTION,
 * which lives here because its final flush reads the canonical doc and must
 * therefore run inside this hook's own teardown, BEFORE the session ends.
 * `serverSync` selects the provider transport when the owner is created.
 */
function useCollabDocHold(
  blockId: string,
  dataText: unknown,
  rowConfirmed: boolean,
  serverSync: boolean,
  projectText: ProjectTextFn,
): CollabDocHold {
  const dataTextRef = useLatestRef(dataText);
  // Render-accurate row-confirmed view for provider CONSTRUCTION (the
  // server provider's pre-seed discriminator): an existing block renders with
  // `rowConfirmed` already true (it only renders because it is in the
  // authoritative rows), a freshly split/inserted block with false.
  // `useLatestRef` writes during render, so every `ensure()` call site (all
  // effects) reads the value of the commit it runs in — never a stale default
  // the later latch effect would have to correct after connect() pre-seeded.
  // Irrelevant on the local path (no stored doc can exist).
  const rowConfirmedRef = useLatestRef(rowConfirmed);

  const buildSeedState = useEventCallback((): Uint8Array =>
    buildSeedStateFor(dataTextRef.current),
  );

  // ONE session per hook instance, started lazily from whichever consumer runs
  // first (the providerFactory call or a subscription effect) — both run in
  // effects, so a discarded render never leaks a session.
  //
  // `id` is a PARAMETER, not a captured `blockId`: `ensure` is a stable
  // `useEventCallback`, so every caller's dependence on the block id would
  // otherwise be invisible — to a reader and to `exhaustive-deps` alike.
  const sessionRef = useRef<CollabSession | null>(null);

  // --- The `content doc → data.text` projection ------------------------------
  //
  // Trigger: every canonical-doc update (local AND server-applied — push-based,
  // never a poll), debounced to one trailing write. VALUE: runs read back OUT of
  // the canonical doc (`projectableRunsOf`), never a serialization of the bound
  // editor — the editor is a VIEW that can silently fall behind its owner, and a
  // view may not overwrite the source it disagrees with. The `DocSourcedRuns`
  // brand on `projectText` is what keeps that true (see `doc-sourced-runs.ts`).
  //
  // The write goes through `projectText`: NOT recorded on the undo stack (Yjs
  // owns text history) and never echoed into any editor (they are bound to the
  // doc; `data.text` is only read once, as the doc-init seed). Skip-if-unchanged
  // keeps no-op churn out of `blocksChanged`. Multiple connected clients each
  // project the same runs — idempotent/convergent, accepted for the
  // my-devices+agents concurrency target.
  const projectTextRef = useLatestRef(projectText);
  const projectionDirtyRef = useRef(false);
  const projectionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushProjection = useEventCallback((opts?: { final?: boolean }): void => {
    if (projectionTimerRef.current !== null) {
      clearTimeout(projectionTimerRef.current);
      projectionTimerRef.current = null;
    }
    // Only fires when a doc update marked us dirty — a doc nothing ever wrote
    // to (subscription pending) must NOT project its emptiness.
    if (!projectionDirtyRef.current) return;
    const session = sessionRef.current;
    if (session && !session.isEnded && !session.writeAllowed && !opts?.final) {
      // THE WRITE GATE (stage 4): this binding cannot yet prove that what the
      // user sees is what the doc holds, so nothing derived from that doc is
      // persisted. Stay DIRTY with no timer armed — `onSessionState` re-runs
      // this the moment the gate opens, push-based. The `final` teardown flush
      // is exempt: the session is going away, so deferring would drop the row's
      // last text rather than delay it.
      return;
    }
    projectionDirtyRef.current = false;
    if (!session || session.isEnded) {
      // Unreachable by construction: the ONLY thing that marks the projection
      // dirty is the doc-update observer, which holds the session, and the
      // teardown below flushes BEFORE ending it. Loud rather than silent — a
      // dropped flush is a row that silently lags its doc forever.
      throw new Error(
        `useCollabBlockDoc: pending projection for "${blockId}" with no live content-doc session`,
      );
    }
    const owner = session.owner;
    const runs = projectableRunsOf(owner.doc);
    const current = coalesce(runsOf(dataTextRef.current));
    // Runs are canonical (coalesced, sorted marks), so JSON equality is exact.
    if (JSON.stringify(runs) === JSON.stringify(current)) return;
    projectTextRef.current(owner.blockId, runs);
  });

  // Event-driven debounce: each doc update marks dirty and arms ONE trailing
  // timer (not reset per keystroke), so a continuous typing run projects at
  // most once per PROJECT_DEBOUNCE_MS instead of starving until a pause.
  const armProjection = useEventCallback((): void => {
    projectionDirtyRef.current = true;
    if (projectionTimerRef.current === null) {
      projectionTimerRef.current = setTimeout(() => flushProjection(), PROJECT_DEBOUNCE_MS);
    }
  });

  // --- Hydration state, forwarded across session churn -----------------------
  //
  // ONE subscription onto whichever session is live, so consumers (the
  // placeholder's `useSyncExternalStore`) subscribe once and still see the
  // successor's transitions after a `rehydrate()` swapped the session out.
  const hydrationListenersRef = useRef(new Set<() => void>());
  const sessionStateUnsubRef = useRef<(() => void) | null>(null);

  const onSessionState = useEventCallback((): void => {
    // The gate may have just opened. A projection window that fired while it
    // was closed left the block dirty with NO timer armed — re-run it now,
    // push-based, instead of waiting for the next keystroke to re-arm one.
    if (projectionDirtyRef.current && projectionTimerRef.current === null) {
      flushProjection();
    }
    for (const cb of [...hydrationListenersRef.current]) cb();
  });

  /** Re-point the forwarding subscription at `session` (a start or a restart). */
  const bindSession = useEventCallback((session: CollabSession): CollabSession => {
    sessionStateUnsubRef.current?.();
    sessionStateUnsubRef.current = session.subscribeState(onSessionState);
    onSessionState();
    return session;
  });

  const hydrationState = useEventCallback(
    (): SessionState => sessionRef.current?.state ?? ATTACHING_STATE,
  );

  const subscribeHydration = useEventCallback((cb: () => void): (() => void) => {
    hydrationListenersRef.current.add(cb);
    return () => {
      hydrationListenersRef.current.delete(cb);
    };
  });

  const verifyRendered = useEventCallback((shown: number, promoteOnly?: boolean): void => {
    const session = sessionRef.current;
    if (session && !session.isEnded) session.verifyRendered(shown, promoteOnly);
  });

  // ONE session per hook instance, started lazily from whichever consumer runs
  // first (the providerFactory call or a subscription effect) — both run in
  // effects, so a discarded render never leaks a session.
  //
  // `id` is a PARAMETER, not a captured `blockId`: `ensure` is a stable
  // `useEventCallback`, so every caller's dependence on the block id would
  // otherwise be invisible — to a reader and to `exhaustive-deps` alike.
  const ensure = useEventCallback((id: string): CollabSession => {
    const current = sessionRef.current;
    if (current && !current.isEnded && current.blockId === id) {
      // Same block, session still alive: RETAIN it — cancel any scheduled end.
      // This is the StrictMode / remount-in-place path, and it is why the end
      // is deferred at all: `CollaborationPlugin` does not re-call its
      // `providerFactory` on a simulated remount, so the very replica and
      // provider it already holds must survive (see `collab-session.ts`).
      current.retain();
      return current;
    }
    // A re-keyed hook, or a spent session (a genuine unmount → later remount of
    // the same hook instance, e.g. under Activity). Either way this session can
    // never be handed out again: end it and start a fresh one. `end()` is
    // idempotent and no-ops on an already-ended session.
    current?.end();
    const next = CollabSession.start(id, buildSeedState, rowConfirmedRef.current, serverSync);
    sessionRef.current = next;
    return bindSession(next);
  });

  const ensureReplica = useEventCallback((id: string): BindingReplica =>
    ensure(id).replicaForBinding(),
  );

  const subscribeDocUpdates = useEventCallback((cb: () => void): (() => void) => {
    const doc = ensure(blockId).owner.doc;
    const notify = (): void => cb();
    doc.on("update", notify);
    return () => doc.off("update", notify);
  });

  useEffect(() => {
    return () => {
      // TEARDOWN ORDER IS EXPLICIT, and it is load-bearing: the final flush
      // (navigation, block removal) READS the canonical doc, so it must run
      // while this hook still holds its session. It used to survive only
      // because the consumer happened to declare its projection hook before
      // this one — a React hook-declaration-order coincidence that nothing
      // stated and nothing checked. Both halves now live here, in one cleanup,
      // in order. `projectText` no-ops when the row is already gone
      // (merge / delete).
      //
      // `end()` is THE single deferred teardown — replica and owner hold alike
      // (see `collab-session.ts`). The session reference is deliberately NOT
      // cleared: the next `ensure()` within the retention window must find it
      // to cancel the pending end, which is the whole StrictMode/remount
      // survival mechanism.
      flushProjection({ final: true });
      sessionStateUnsubRef.current?.();
      sessionStateUnsubRef.current = null;
      sessionRef.current?.end();
    };
  }, [blockId, flushProjection]);

  // `peek` is the non-starting read of the current session: `getSaveState`
  // must not mint an owner from a render-phase `useSyncExternalStore` probe.
  // A spent session reads as none — it owns nothing any more.
  const peek = useEventCallback((): CollabSession | null => {
    const session = sessionRef.current;
    return session && !session.isEnded ? session : null;
  });

  const restartSession = useEventCallback((): boolean => {
    const session = peek();
    if (!session) return false;
    sessionRef.current = bindSession(session.restart());
    return true;
  });

  return {
    ensure,
    peek,
    restartSession,
    ensureReplica,
    armProjection,
    subscribeDocUpdates,
    hydrationState,
    subscribeHydration,
    verifyRendered,
  };
}

/**
 * The two content-doc observer effects shared by both hooks: the projection
 * observer (`doc.on("update")`) and the undo-capture observer. Storage-
 * agnostic — a local doc's updates and undo items surface identically.
 *
 * Both observe the CANONICAL doc, deliberately — never the session's binding
 * replica. Every replica edit relays into the canonical synchronously, so the
 * canonical sees the union of all bindings' edits (a replica sees only its own
 * plus relays), and the projection/undo semantics are identical whether one
 * or five editors of the block are mounted.
 */
function useDocObservers(
  blockId: string,
  ensure: (id: string) => CollabSession,
  armProjection: () => void,
  onUndoableEdit?: (edit: CapturedBlockDocEdit) => void,
): void {
  // Doc-content observer arming the projection. `doc.on("update")` fires once
  // per transaction for local AND server-applied changes — and only when the
  // transaction actually integrated something, so a redundant re-apply of state
  // the doc already holds arms nothing.
  useEffect(() => {
    const doc = ensure(blockId).owner.doc;
    const notify = () => armProjection();
    doc.on("update", notify);
    return () => doc.off("update", notify);
  }, [blockId, armProjection, ensure]);

  // Undo-capture observer (Stage 3b): surface each new coalesced local editing
  // run to the consumer so it can be recorded onto the unified undo stack.
  useEffect(
    () => (onUndoableEdit ? ensure(blockId).owner.onUndoableEdit(onUndoableEdit) : undefined),
    [blockId, onUndoableEdit, ensure],
  );
}

/** The `providerFactory` `CollaborationPlugin` calls to fetch the block's doc + provider. */
function useProviderFactory(
  blockId: string,
  ensureReplica: (id: string) => BindingReplica,
): CollabProviderFactory {
  return useEventCallback((id: string, yjsDocMap: Map<string, Doc>): Provider => {
    if (id !== blockId) {
      throw new Error(
        `useCollabBlockDoc: providerFactory id "${id}" != block id "${blockId}"`,
      );
    }
    // The binding gets the session's per-binding REPLICA, never the shared
    // canonical doc: a binding must attach to an empty doc and hydrate from
    // post-attach events (see `binding-replica.ts` and the module comment).
    const replica = ensureReplica(blockId);
    // CollaborationPlugin reads the doc back out of the map it hands us.
    yjsDocMap.set(id, replica.replicaDoc);
    return replica;
  });
}

/**
 * OUT (observability), shared by both hooks: the provider's derived save state,
 * for the surface's sync-status cloud. Keyed on `blockId` so a re-keyed hook
 * resubscribes to the NEW provider's listener set instead of staying bound to
 * the old owner's. `getSnapshot` tolerates "no session yet" (a first render,
 * before any effect has called `ensure()`): nothing has been typed, so nothing
 * can be unsaved. The provider memoizes its snapshot, so this can't loop.
 *
 * On the local transport this is permanently {@link IDLE_SAVE_STATE} — nothing
 * to save, nothing to retry — which the cloud aggregates to silence.
 */
function useSaveState(
  blockId: string,
  { ensure, peek }: CollabDocHold,
): Pick<CollabBlockDoc, "saveState" | "retrySave"> {
  const subscribeSaveState = useCallback(
    (onStoreChange: () => void) => ensure(blockId).owner.provider.onSaveState(onStoreChange),
    [blockId, ensure],
  );
  const getSaveState = useCallback(
    (): CollabSaveState => peek()?.owner.provider.getSaveState() ?? IDLE_SAVE_STATE,
    [peek],
  );
  const saveState = useSyncExternalStore(subscribeSaveState, getSaveState);
  const retrySave = useEventCallback((): void => {
    peek()?.owner.provider.retryFlush();
  });
  return { saveState, retrySave };
}

/**
 * The hydration-recovery surface shared by both hooks: read the canonical doc,
 * and put a block that lost hydration back together. `attachGeneration` is
 * state (not a ref) precisely because its only job is to change a React key.
 */
function useRehydration(
  hold: CollabDocHold,
): Pick<CollabBlockDoc, "attachGeneration" | "docContentLength" | "hasLocalEdits" | "rehydrate"> {
  const [attachGeneration, setAttachGeneration] = useState(0);
  const { peek, restartSession } = hold;

  const docContentLength = useEventCallback((): number => {
    const session = peek();
    return session ? xmlTextContentLength(yDocContent(session.owner.doc)) : 0;
  });

  const hasLocalEdits = useEventCallback(
    (): boolean => peek()?.owner.provider.hasLocalEdits ?? false,
  );

  const rehydrate = useEventCallback((): void => {
    // ONE verb: a new session structurally IS a fresh empty replica plus an
    // authoritative re-read, so recovery and a normal attach are the same code
    // path and nothing here has to guess which side was short (see
    // `collab-session.ts`). The only remaining half is the React key — Lexical
    // builds its binding exactly once per mount behind a ref, so a changed key
    // is the only thing that re-attaches a binding.
    if (restartSession()) setAttachGeneration((g) => g + 1);
  });

  return { attachGeneration, docContentLength, hasLocalEdits, rehydrate };
}

/**
 * OUT (observability), shared by both hooks: this binding's live hydration
 * state, for the placeholder and the stalled Retry. Subscribed through the
 * hold's ONE forwarding listener, so a `rehydrate()` that swaps the session
 * underneath is invisible here — nothing re-subscribes and no transition is
 * missed. `getSnapshot` is identity-stable (each state is a frozen object
 * replaced only on a real transition; `ATTACHING_STATE` covers "no session
 * yet"), so `useSyncExternalStore` cannot loop.
 */
function useHydrationState(hold: CollabDocHold): SessionState {
  const { hydrationState, subscribeHydration } = hold;
  return useSyncExternalStore(subscribeHydration, hydrationState);
}

export function useCollabBlockDoc(
  blockId: string,
  dataText: unknown,
  rowConfirmed: boolean,
  projectText: ProjectTextFn,
  onUndoableEdit?: (edit: CapturedBlockDocEdit) => void,
): CollabBlockDoc {
  const hold = useCollabDocHold(blockId, dataText, rowConfirmed, true, projectText);
  const { ensure, armProjection, subscribeDocUpdates } = hold;
  useDocObservers(blockId, ensure, armProjection, onUndoableEdit);

  // Doc-init FK gate (Stage 4a): unlatch the provider once the block's row is
  // server-confirmed. One-way — the provider ignores repeats — and push-based:
  // this effect re-fires on the authoritative blocks push that flips
  // `rowConfirmed` true.
  useEffect(() => {
    if (rowConfirmed) ensure(blockId).owner.provider.markBlockRowConfirmed();
  }, [blockId, rowConfirmed, ensure]);

  // IN: the per-block live subscription. Subscribing only while a block editor
  // is mounted is the lazy content-loading win; each pushed value flows into
  // the provider, which merges it (idempotently) into the shared doc.
  const params = useMemo(() => ({ blockId }), [blockId]);
  const contentRes = useResource(blockContentResource, params);
  useEffect(() => {
    // While loading we can't tell "absent" (→ seed) from "not arrived yet",
    // so nothing is delivered until the subscription settles.
    if (contentRes.pending) return;
    ensure(blockId).owner.provider.onServerState(contentRes.data[0]?.state ?? null);
    // `contentRes` identity recomputes only on pending/data/error (structural
    // sharing in useResource), so this fires once per actual server change.
  }, [blockId, contentRes, ensure]);

  const { saveState, retrySave } = useSaveState(blockId, hold);
  const providerFactory = useProviderFactory(blockId, hold.ensureReplica);
  const rehydration = useRehydration(hold);
  const hydration = useHydrationState(hold);
  return {
    providerFactory,
    saveState,
    retrySave,
    subscribeDocUpdates,
    hydration,
    verifyRendered: hold.verifyRendered,
    ...rehydration,
  };
}

/**
 * In-memory (`persist={false}`) twin of {@link useCollabBlockDoc}: binds a
 * block to a purely LOCAL {@link LocalYjsProvider} — the per-block `Y.Doc` is
 * seeded from `data.text` at connect() and NEVER touches the network (no
 * `blockContentResource` subscription — which would also require a
 * `NotificationsProvider` the demo doesn't mount — no doc-init/doc-update, no
 * FK gate). Typing, formatting, split, and merge all work locally; the doc
 * observers (projection + undo capture) fire exactly as on the server path, so
 * the projection writes runs into the in-memory store and text edits still ride
 * the unified undo stack. THE seam for how in-memory content docs "sync": they
 * don't — hence a permanently idle {@link CollabBlockDoc.saveState}.
 */
export function useLocalCollabBlockDoc(
  blockId: string,
  dataText: unknown,
  projectText: ProjectTextFn,
  onUndoableEdit?: (edit: CapturedBlockDocEdit) => void,
): CollabBlockDoc {
  // `rowConfirmed` is irrelevant with no server (no stored doc, no FK gate);
  // pass true so nothing is ever gated.
  const hold = useCollabDocHold(blockId, dataText, true, false, projectText);
  const { ensure, armProjection, subscribeDocUpdates } = hold;
  useDocObservers(blockId, ensure, armProjection, onUndoableEdit);

  const { saveState, retrySave } = useSaveState(blockId, hold);
  const providerFactory = useProviderFactory(blockId, hold.ensureReplica);
  const rehydration = useRehydration(hold);
  // The SAME machine as the server path — never a fork. `serverSync: false`
  // makes every local session locally authoritative, so it reaches `hydrated`
  // inside its first synchronous `connect()` and `stalled` is unreachable.
  const hydration = useHydrationState(hold);
  return {
    providerFactory,
    saveState,
    retrySave,
    subscribeDocUpdates,
    hydration,
    verifyRendered: hold.verifyRendered,
    ...rehydration,
  };
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
 *     owner that mounts meanwhile) converges via the resource push.
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
