import { applyUpdate, encodeStateAsUpdate, mergeUpdates, type Doc } from "yjs";
import { Awareness } from "y-protocols/awareness";
import type { Provider, ProviderAwareness } from "@lexical/yjs";
import { EndpointError, fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { subscribeWsStatus } from "@plugins/primitives/plugins/networking/web";
import { liveStateSocketKind } from "@plugins/primitives/plugins/live-state/web";
import {
  blockDocInit,
  blockDocUpdate,
} from "@plugins/page/plugins/editor-collab/core";

/**
 * `@lexical/yjs` {@link Provider} whose "network" is the app's existing
 * live-state + endpoints primitives instead of a Yjs wire protocol
 * (per-block CRDT plan, `research/2026-07-07-page-per-block-crdt-plan-b.md`,
 * Stage 2):
 *
 * - **in** — the per-block `blockContentResource` live subscription. The owning
 *   hook pushes each server value into {@link onServerState}; the provider
 *   `Y.applyUpdate`s it with itself as transaction origin. Idempotent and
 *   commutative, so the sender's own echo is a no-op and a concurrent remote
 *   edit lands as a *merge* — never a string rebuild, which is what makes
 *   fast typing caret-safe.
 * - **out** — `POST doc-init` (first-writer-wins seed) and debounced
 *   `POST doc-update` (incremental updates, merged per flush).
 *
 * Origin discipline (the echo guard): every server-applied update carries
 * `origin === this`, and `onDocUpdate` forwards only updates with any OTHER
 * origin (the `@lexical/yjs` binding, i.e. local edits) to the server. A
 * server echo therefore never round-trips back out.
 *
 * Seeding (the duplicate-seed hazard): when the block has no stored doc yet,
 * the provider POSTs a seed built from the block's `data.text` (built ONCE and
 * cached — `seedState`) and applies the server's authoritative response state
 * to the live doc. Seeds are DETERMINISTIC (content-hashed fixed clientID in
 * `use-collab-block-doc.ts`), so two clients seeding the same text produce
 * byte-identical updates and converge by no-op merge; different texts get
 * different clientIDs and can at worst duplicate, never corrupt. For a
 * client-minted block (row unconfirmed ⇒ no stored doc can exist) the seed is
 * additionally pre-applied LOCALLY at connect() — instant hydration, legacy
 * parity (see connect()).
 *
 * The pre-seed discriminator is RENDER-ACCURATE, not effect-timed: the
 * constructor takes the row-confirmed state observed at the owning consumer's
 * render (an existing block only renders because it is in the authoritative
 * rows, so it constructs with `blockRowConfirmed = true` and can NEVER
 * pre-seed; a freshly split/inserted block constructs unconfirmed and still
 * hydrates instantly). Relying on the later `markBlockRowConfirmed` parent
 * effect instead would make correctness depend on `CollaborationPlugin`
 * happening to defer `connect()` past that effect — nothing in the provider
 * contract guarantees that order, and a connect-first interleave would merge
 * the `data.text`-derived seed into the stored doc as DUPLICATED text.
 *
 * Seed ordering (the doc-init FK race, Stage 4a): a freshly created / split
 * block mounts its editor from the OPTIMISTIC overlay before the structural
 * op's POST has created the `_blocks` row server-side — a doc-init fired at
 * that instant would hit the `page_block_docs → page_blocks` FK and 500.
 * Seeding is therefore gated on {@link markBlockRowConfirmed}: the owning hook
 * calls it once the block id appears in AUTHORITATIVE (server-truth, not
 * overlaid) blocks data, which the client already subscribes to — so the gate
 * lifts push-based, on the very push that confirms the row. Until then local
 * edits buffer in `pendingUpdates` and flush right after the seed completes.
 *
 * Offline resilience: a NETWORK-level seed/flush failure (fetch rejects — no
 * HTTP status) is an expected state, not a bug: the bytes stay queued in the
 * local doc / `pendingUpdates` and are retried push-based on the next
 * live-state socket reopen (ws-status bus), the next server push, or the next
 * local edit — never a retry timer. Unexpected HTTP errors still throw loudly.
 *
 * Doc-row loss (`doc-update` 409 after sync): never assume which of the two
 * causes it was. A doc-init probe arbitrates: 404 (block genuinely deleted —
 * merge/delete FK cascade) is a quiet terminal stop; success (block alive,
 * row unexpectedly gone) recovers by re-creating the row from the FULL local
 * doc state and resuming flushes, with a loud console.error — a 409 can
 * therefore never silently stop a live block from saving.
 *
 * Teardown safety: the registry's deferred destroy only finalizes when
 * {@link readyForTeardown}; while buffered edits remain flushable the entry
 * is retained and the reconnect listeners (still subscribed until destroy)
 * drain the queue, then signal {@link setTeardownReadyListener} push-based.
 *
 * Awareness is a real `y-protocols` {@link Awareness} (CollaborationPlugin
 * requires a functional one for its focus tracking) but is never broadcast —
 * the concurrency target is one user's own tabs + agents, no live cursors.
 *
 * Events implemented (the exact set `CollaborationPlugin` listens for):
 * `sync` (isSynced) and `status` ({status}); `update`/`reload` are accepted
 * but never emitted (no doc reload in this transport).
 */

/** Debounce window for batching local updates into one doc-update POST. */
const FLUSH_DEBOUNCE_MS = 300;

/** Decode the wire base64 (see editor-collab's `stateToBase64`) to bytes. */
export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export class LiveStateYjsProvider implements Provider {
  private readonly doc: Doc;
  private readonly blockId: string;
  /** Builds the seed `Y.encodeStateAsUpdate` bytes from the block's `data.text`. */
  private readonly buildSeedState: () => Uint8Array;
  // Real Awareness so CollaborationPlugin's initLocalState/focus tracking has
  // functional local state; it never leaves this client (nothing broadcasts it).
  private readonly _awareness: Awareness;

  private connected = false;
  private synced = false;
  private initStarted = false;
  private destroyed = false;
  /**
   * The seed bytes, built ONCE and reused for the local pre-apply AND every
   * doc-init attempt. One snapshot per provider is load-bearing: a retry that
   * rebuilt the seed from a since-updated `data.text` would post bytes that
   * differ from what was pre-applied locally — with the deterministic
   * content-hashed clientID they'd merge as duplication instead of a no-op.
   */
  private seedState: Uint8Array | null = null;
  /**
   * True once the block's row is known to exist in server truth — the doc-init
   * FK precondition AND the pre-seed discriminator. Initialized from the
   * owning consumer's RENDER-TIME view (accurate at first render: existing
   * blocks only render because they are in the authoritative rows), then a
   * one-way latch lifted by {@link markBlockRowConfirmed} from the
   * authoritative blocks subscription (see the module comment).
   */
  private blockRowConfirmed: boolean;
  /**
   * Server-confirmed "the block row no longer exists" (doc-init 404):
   * terminal quiet stop — the content moved with a merge or went with the
   * delete, so buffered bytes are deliberately dropped and the provider is
   * finalizable.
   */
  private blockGone = false;
  /**
   * Post-sync 409 recovery mode: the doc row vanished under us. The next
   * doc-init must seed from the FULL local doc state (never the `data.text`
   * seed — that would be an independent encoding of content the local doc
   * already holds and merge as duplication).
   */
  private reinitFromLocalDoc = false;
  /** Latest value from the live subscription (undefined until first load). */
  private serverState: string | null | undefined = undefined;
  /** Last applied wire state — skips redundant decode+apply on echoes. */
  private lastAppliedState: string | null = null;

  private pendingUpdates: Uint8Array[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private flushInFlight = false;
  /** One offline warning per outage episode (reset on the next success). */
  private offlineWarned = false;
  private readonly unsubscribeWsStatus: () => void;
  /**
   * Single-slot teardown notifier (registry-owned): invoked whenever the
   * provider BECOMES ready-for-teardown, so a deferred destroy that found
   * buffered edits can finalize push-based once they drain (see
   * {@link readyForTeardown}).
   */
  private teardownReadyListener: (() => void) | null = null;

  private readonly syncListeners = new Set<(isSynced: boolean) => void>();
  private readonly statusListeners = new Set<(arg: { status: string }) => void>();
  private readonly updateListeners = new Set<(arg: unknown) => void>();
  private readonly reloadListeners = new Set<(doc: Doc) => void>();

  constructor(
    doc: Doc,
    blockId: string,
    buildSeedState: () => Uint8Array,
    blockRowConfirmed: boolean,
  ) {
    this.doc = doc;
    this.blockId = blockId;
    this.buildSeedState = buildSeedState;
    this.blockRowConfirmed = blockRowConfirmed;
    this._awareness = new Awareness(doc);
    doc.on("update", this.onDocUpdate);
    // Reconnect signals (push-based, no polling): resume whatever an outage
    // interrupted — an incomplete seed or a buffered local-edit queue — on
    // either network-back edge:
    //  - the live-state worktree socket reopening (covers server restarts,
    //    where navigator.onLine never changed; HTTP and the WS ride the same
    //    gateway, so "socket reopened" implies endpoints are reachable again);
    //  - the browser's `online` event (covers actual connectivity loss, where
    //    an idle WS may not surface a close promptly).
    this.unsubscribeWsStatus = subscribeWsStatus((ev) => {
      if (ev.status !== "open" || liveStateSocketKind(ev.url) !== "worktree") return;
      this.onTransportReconnected();
    });
    window.addEventListener("online", this.onBrowserOnline);
  }

  private readonly onBrowserOnline = (): void => {
    this.onTransportReconnected();
  };

  get awareness(): ProviderAwareness {
    // y-protocols' `Awareness` types its states as generic records while
    // `@lexical/yjs` narrows them to `UserState`; the shapes are runtime-
    // compatible (Awareness stores whatever `initLocalState` writes) and this
    // is the standard y-protocols ↔ Lexical pairing. The cast bridges the
    // third-party declaration gap — there is no local type to fix.
    return this._awareness as unknown as ProviderAwareness;
  }

  // --- Provider interface ---------------------------------------------------

  connect(): void {
    this.connected = true;
    this.emitStatus("connected");
    if (this.synced) {
      // Reconnect (e.g. StrictMode disconnect→connect): re-announce sync so
      // CollaborationPlugin's onSync bookkeeping re-runs against the live doc.
      this.emitSync(true);
      return;
    }
    // INSTANT local hydration for a client-minted block (Stage 4a): while the
    // block's row is unconfirmed, no `page_block_docs` row can exist (FK), so
    // pre-applying the seed cannot collide with any stored state — the editor
    // shows the split tail / empty paragraph IMMEDIATELY, exactly like the
    // legacy synchronous hydration, instead of staying empty for the
    // confirm-push + doc-init round trips (during which typing/Enter would
    // interact with a half-hydrated doc). The seed is DETERMINISTIC
    // (content-hashed fixed clientID — see `use-collab-block-doc.ts`), so the
    // eventual authoritative state (our own doc-init echo, or a racing tab's
    // byte-identical seed) merges as a no-op. `blockRowConfirmed` here is the
    // construction-time (render-accurate) value — an existing block is
    // confirmed from its very first render, so this branch is structurally
    // unreachable for it regardless of when CollaborationPlugin calls
    // connect() relative to the owning hook's effects. connect() runs right
    // after the binding attaches and before the user can type, so the
    // store-empty guard holds in practice; it is checked anyway.
    if (!this.blockRowConfirmed && this.serverState == null && this.doc.store.clients.size === 0) {
      this.preApplySeed();
    }
    // First value not in yet — onServerState completes the handshake when the
    // subscription delivers it (push-based; never polled).
    if (this.serverState === undefined) return;
    if (this.serverState !== null) this.markSynced();
    else this.maybeInit();
  }

  /** Apply the (cached, deterministic) seed to the live doc, provider-origin. */
  private preApplySeed(): void {
    this.seedState ??= this.buildSeedState();
    applyUpdate(this.doc, this.seedState, this);
  }

  disconnect(): void {
    this.connected = false;
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    // Flush pending local edits eagerly on teardown (skip the debounce window)
    // so an unmount mid-typing-run never strands the last keystrokes.
    if (this.synced && this.pendingUpdates.length > 0) void this.flushLoop();
    this.emitStatus("disconnected");
  }

  on(type: "sync", cb: (isSynced: boolean) => void): void;
  on(type: "status", cb: (arg: { status: string }) => void): void;
  on(type: "update", cb: (arg: unknown) => void): void;
  on(type: "reload", cb: (doc: Doc) => void): void;
  on(
    type: "sync" | "status" | "update" | "reload",
    cb:
      | ((isSynced: boolean) => void)
      | ((arg: { status: string }) => void)
      | ((arg: unknown) => void)
      | ((doc: Doc) => void),
  ): void {
    if (type === "sync") this.syncListeners.add(cb as (isSynced: boolean) => void);
    else if (type === "status") this.statusListeners.add(cb as (arg: { status: string }) => void);
    else if (type === "update") this.updateListeners.add(cb as (arg: unknown) => void);
    else this.reloadListeners.add(cb as (doc: Doc) => void);
  }

  off(type: "sync", cb: (isSynced: boolean) => void): void;
  off(type: "status", cb: (arg: { status: string }) => void): void;
  off(type: "update", cb: (arg: unknown) => void): void;
  off(type: "reload", cb: (doc: Doc) => void): void;
  off(
    type: "sync" | "status" | "update" | "reload",
    cb:
      | ((isSynced: boolean) => void)
      | ((arg: { status: string }) => void)
      | ((arg: unknown) => void)
      | ((doc: Doc) => void),
  ): void {
    if (type === "sync") this.syncListeners.delete(cb as (isSynced: boolean) => void);
    else if (type === "status") this.statusListeners.delete(cb as (arg: { status: string }) => void);
    else if (type === "update") this.updateListeners.delete(cb as (arg: unknown) => void);
    else this.reloadListeners.delete(cb as (doc: Doc) => void);
  }

  // --- Server → local (fed by the owning hook's live subscription) ----------

  /**
   * Deliver the latest `blockContentResource` value: the stored base64 state,
   * or `null` when the block has no doc row yet (first-ever open → seed).
   * Called on every push; `Y.applyUpdate` idempotency makes echoes no-ops.
   */
  onServerState(state: string | null): void {
    if (this.destroyed) return;
    this.serverState = state;
    if (state !== null) {
      if (state !== this.lastAppliedState) {
        this.lastAppliedState = state;
        applyUpdate(this.doc, base64ToBytes(state), this);
      }
      if (this.connected && !this.synced) this.markSynced();
    } else if (this.connected) {
      // No stored doc. Seed exactly once (first-writer-wins server-side).
      // After a successful init this is normally unreachable (doc-init is the
      // only row creator and rows die with the block, whose editor unmounts)
      // — except the post-409 recovery state, where `synced` was reset and
      // maybeInit re-runs the init in from-local-doc mode.
      this.maybeInit();
    }
    // Push-driven flush retry: a queue left behind by a transient network
    // failure (no armed debounce timer) drains on the next server push instead
    // of waiting for the next local keystroke. During normal typing the
    // debounce timer is armed, so this never bypasses the batching window.
    if (
      this.synced &&
      this.pendingUpdates.length > 0 &&
      this.flushTimer === null &&
      !this.flushInFlight
    ) {
      void this.flushLoop();
    }
  }

  /**
   * The doc-init existence gate (see the module comment): the owning hook
   * calls this once the block id is present in AUTHORITATIVE blocks data.
   * One-way latch; lifting it retries a seed that was gated (or that failed
   * transiently and re-armed).
   */
  markBlockRowConfirmed(): void {
    if (this.blockRowConfirmed || this.destroyed) return;
    this.blockRowConfirmed = true;
    if (this.connected && !this.synced && this.serverState === null) this.maybeInit();
  }

  // --- Local → server --------------------------------------------------------

  /**
   * Forward local edits (any origin but this provider — i.e. the
   * `@lexical/yjs` binding's transactions) to the debounced flush queue.
   * Server-applied updates carry `origin === this` and are never echoed back.
   */
  private readonly onDocUpdate = (update: Uint8Array, origin: unknown): void => {
    if (origin === this) return;
    this.pendingUpdates.push(update);
    this.scheduleFlush();
  };

  private scheduleFlush(): void {
    // Before sync/init completes, doc-update would 409 — the queue drains right
    // after markSynced instead.
    if (!this.synced || this.destroyed) return;
    if (this.flushTimer !== null) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flushLoop();
    }, FLUSH_DEBOUNCE_MS);
  }

  /**
   * Single-flight drain of the pending-update queue: merge the batch into one
   * incremental update and POST it. On failure the merged bytes are re-queued
   * (the next local edit or flush retries them — no silent data loss) and the
   * error is rethrown so it surfaces loudly.
   */
  private async flushLoop(): Promise<void> {
    if (this.flushInFlight) return;
    this.flushInFlight = true;
    try {
      while (this.pendingUpdates.length > 0 && this.synced) {
        const batch = this.pendingUpdates;
        this.pendingUpdates = [];
        const update = batch.length === 1 ? batch[0]! : mergeUpdates(batch);
        try {
          await fetchEndpoint(
            blockDocUpdate,
            { id: this.blockId },
            { body: new Blob([update as BlobPart]) },
          );
          this.offlineWarned = false;
        } catch (err) {
          // 409 = "no doc row". We only flush AFTER a successful init/sync, so
          // the row existed — it vanished under us. Two causes with OPPOSITE
          // handling share this status, so never guess here:
          //  - the BLOCK was deleted (merge/delete FK-cascaded the doc row
          //    while a flush was pending: e.g. Backspace-merge captures the
          //    live runs, appends them to the target, then structurally
          //    deletes this block). The content already moved — quiet stop.
          //  - the doc row vanished while the block still LIVES (unexpected):
          //    stopping would silently buffer this block's edits forever.
          // Re-arm the init path in from-local-doc mode and let doc-init
          // arbitrate AUTHORITATIVELY: it 404s iff the block row is absent
          // (→ terminal quiet stop via `blockGone`), otherwise it re-creates
          // the doc row from the FULL local doc state — nothing lost — and
          // the flush loop resumes (loudly flagged; see initDoc).
          if (err instanceof EndpointError && err.status === 409) {
            this.pendingUpdates.unshift(update);
            this.synced = false;
            this.initStarted = false;
            this.reinitFromLocalDoc = true;
            this.maybeInit();
            return;
          }
          this.pendingUpdates.unshift(update);
          // Any HTTP response other than the arbitrated 409 above is a real
          // server-side rejection — surface it loudly.
          if (err instanceof EndpointError) throw err;
          // Network-level failure (offline, server restarting): an EXPECTED
          // state for a local-first doc, not a bug. The merged bytes are back
          // at the queue head; retried push-based on socket-reopen / next
          // server push / next local edit. Warn once per episode so the
          // console shows edits are buffering.
          if (!this.offlineWarned) {
            this.offlineWarned = true;
            console.warn(
              `[collab] doc-update for block ${this.blockId} failed (offline?) — edits are buffered locally and will flush on reconnect`,
              err,
            );
          }
          return;
        }
      }
    } finally {
      this.flushInFlight = false;
      // A drained queue may unblock a deferred destroy (see readyForTeardown).
      this.notifyTeardownReady();
    }
  }

  // --- Seed / sync ------------------------------------------------------------

  private maybeInit(): void {
    // FK-precondition gate (Stage 4a): never doc-init before the block's row
    // is server-confirmed — a premature seed would FK-fail. The confirmation
    // push lifts the gate via markBlockRowConfirmed.
    if (!this.blockRowConfirmed) return;
    if (this.initStarted || this.synced || this.destroyed || this.blockGone) return;
    this.initStarted = true;
    void this.initDoc();
  }

  private async initDoc(): Promise<void> {
    const recovering = this.reinitFromLocalDoc;
    let seed: Uint8Array;
    if (recovering && this.doc.store.clients.size > 0) {
      // Post-409 recovery: the LOCAL doc is the best-known content (the
      // stored state it already merged + any unflushed edits). Seeding from
      // `data.text` here would be an INDEPENDENT encoding of content the doc
      // already holds and would merge back as duplicated text.
      seed = encodeStateAsUpdate(this.doc);
    } else {
      // Seed bytes from the block's `data.text` — built once and cached (see
      // `seedState`). For a pre-seeded client-minted block these exact bytes
      // are already in the live doc; for everything else they are a throwaway
      // proposal and only the server's authoritative response is applied.
      // Either way first-writer-wins + the deterministic encoding mean racing
      // seeders converge instead of duplicating.
      this.seedState ??= this.buildSeedState();
      seed = this.seedState;
    }
    let res: { state: string };
    try {
      res = await fetchEndpoint(
        blockDocInit,
        { id: this.blockId },
        { body: new Blob([seed as BlobPart]) },
      );
    } catch (err) {
      // Whatever failed, the latch MUST re-arm: a wedged `initStarted` would
      // leave the block editable-but-never-synced until a remount (the exact
      // Stage-4a failure mode). The next trigger — confirmation push, server
      // push, socket reopen — retries the seed.
      this.initStarted = false;
      if (err instanceof EndpointError && err.status === 404) {
        // Block row deleted — SERVER-CONFIRMED absence (doc-init's "block
        // does not exist"): nothing to sync, the editor is unmounting (or
        // already unmounted). Terminal quiet stop: drop the buffered bytes
        // deliberately (their content moved with the merge / went with the
        // delete) and let a deferred destroy finalize.
        this.blockGone = true;
        this.pendingUpdates = [];
        this.notifyTeardownReady();
        return;
      }
      if (err instanceof EndpointError) throw err;
      // Network-level failure: expected offline state; the socket-reopen
      // signal retries (see onTransportReconnected).
      if (!this.offlineWarned) {
        this.offlineWarned = true;
        console.warn(
          `[collab] doc-init for block ${this.blockId} failed (offline?) — will retry on reconnect`,
          err,
        );
      }
      return;
    }
    if (this.destroyed) return;
    this.offlineWarned = false;
    if (recovering) {
      // The block is ALIVE yet its doc row had vanished — no sanctioned path
      // does that (doc rows only die with their block). We recovered (row
      // re-created from the full local state, queue resumes below), but the
      // interleave itself is a bug somewhere — surface it loudly.
      console.error(
        `[collab] content doc row for block ${this.blockId} vanished while the block still exists — re-created it from the local doc state (no edits lost). This should not happen; investigate what deleted the row.`,
      );
    }
    if (res.state !== this.lastAppliedState) {
      this.lastAppliedState = res.state;
      applyUpdate(this.doc, base64ToBytes(res.state), this);
    }
    // A racing winner's push may have marked us synced already — markSynced
    // re-emitting is harmless (shouldBootstrap is false).
    this.markSynced();
  }

  /** Socket-reopen edge: resume an interrupted seed or drain a buffered queue. */
  private onTransportReconnected(): void {
    // Deliberately NOT gated on `connected`: a teardown-retained provider
    // (editor unmounted with buffered edits during an outage — the deferred
    // destroy is waiting on readyForTeardown) must still drain its queue on
    // reconnect, or the retained bytes would never flush.
    if (this.destroyed) return;
    if (!this.synced) {
      if (this.serverState === null || this.reinitFromLocalDoc) this.maybeInit();
      return;
    }
    if (this.pendingUpdates.length > 0 && !this.flushInFlight) void this.flushLoop();
  }

  private markSynced(): void {
    if (this.reinitFromLocalDoc) {
      // Recovery handshake completed (our own re-init, or a racing replica's
      // push re-created the row first). Whatever re-created the doc row may
      // lack updates this doc had flushed to the OLD row — enqueue the full
      // local state once; merging a full state is idempotent and restores
      // anything missing.
      this.reinitFromLocalDoc = false;
      this.pendingUpdates.push(encodeStateAsUpdate(this.doc));
    }
    this.synced = true;
    this.emitSync(true);
    if (this.pendingUpdates.length > 0) void this.flushLoop();
  }

  // --- Lifecycle ---------------------------------------------------------------

  /**
   * True when destroying this provider cannot lose buffered local edits:
   * nothing is queued or in flight, or the block is server-confirmed gone
   * (the bytes were deliberately dropped — see `blockGone`). The registry's
   * deferred destroy checks this and, when false, RETAINS the entry (the
   * provider's reconnect listeners stay live until destroy) instead of
   * destroying bytes that a reconnect could still save.
   */
  get readyForTeardown(): boolean {
    return (
      this.destroyed ||
      this.blockGone ||
      (this.pendingUpdates.length === 0 && !this.flushInFlight)
    );
  }

  /**
   * Register the (single) registry callback invoked whenever the provider
   * BECOMES ready-for-teardown — the push-based finalize signal for a
   * deferred destroy that found buffered edits. Overwrites any previous
   * listener (one registry owner per provider); pass `null` to clear.
   */
  setTeardownReadyListener(cb: (() => void) | null): void {
    this.teardownReadyListener = cb;
  }

  private notifyTeardownReady(): void {
    if (this.readyForTeardown) this.teardownReadyListener?.();
  }

  /** Full teardown (registry-owned): flush, detach doc listener, kill awareness. */
  destroy(): void {
    if (this.destroyed) return;
    this.disconnect();
    this.destroyed = true;
    this.unsubscribeWsStatus();
    window.removeEventListener("online", this.onBrowserOnline);
    this.doc.off("update", this.onDocUpdate);
    this._awareness.destroy();
    this.teardownReadyListener = null;
    this.syncListeners.clear();
    this.statusListeners.clear();
    this.updateListeners.clear();
    this.reloadListeners.clear();
  }

  private emitSync(isSynced: boolean): void {
    for (const cb of [...this.syncListeners]) cb(isSynced);
  }

  private emitStatus(status: string): void {
    for (const cb of [...this.statusListeners]) cb({ status });
  }
}
