import { applyUpdate, type Doc } from "yjs";
import { Awareness } from "y-protocols/awareness";
import type { ProviderAwareness } from "@lexical/yjs";
import type { BlockDocProvider } from "./use-collab-block-doc";
import { IDLE_SAVE_STATE, type CollabSaveState } from "./live-state-yjs-provider";

/**
 * Local-only content-doc provider for the in-memory editor mode
 * (`<BlockEditor persist={false}>`). It satisfies the SAME `@lexical/yjs`
 * `Provider` contract as {@link LiveStateYjsProvider}, so `CollaborationPlugin`
 * binds to it identically — but it has NO network: the per-block `Y.Doc` is
 * seeded ONCE from the block's `data.text` at `connect()` and never touches
 * `blockContentResource` / `doc-init` / `doc-update`. Typing, formatting,
 * split, and merge all operate purely on the local doc; nothing is persisted
 * or sent anywhere.
 *
 * This is the memory-mode half of the transport seam: `useCollabBlockDoc`
 * (server) constructs a `LiveStateYjsProvider`; `useLocalCollabBlockDoc`
 * constructs this. The seam is the ONLY place the editor knows how content
 * docs sync.
 */
export class LocalYjsProvider implements BlockDocProvider {
  private readonly doc: Doc;
  /** Builds the seed `Y.encodeStateAsUpdate` bytes from the block's `data.text`. */
  private readonly buildSeedState: () => Uint8Array;
  // Real Awareness so CollaborationPlugin's initLocalState/focus tracking has
  // functional local state; it never leaves this client (nothing broadcasts it).
  private readonly _awareness: Awareness;

  private destroyed = false;

  private readonly syncListeners = new Set<(isSynced: boolean) => void>();
  private readonly statusListeners = new Set<(arg: { status: string }) => void>();
  private readonly updateListeners = new Set<(arg: unknown) => void>();
  private readonly reloadListeners = new Set<(doc: Doc) => void>();

  constructor(doc: Doc, buildSeedState: () => Uint8Array) {
    this.doc = doc;
    this.buildSeedState = buildSeedState;
    this._awareness = new Awareness(doc);
  }

  get awareness(): ProviderAwareness {
    // Same y-protocols ↔ Lexical declaration-gap cast as LiveStateYjsProvider.
    return this._awareness as unknown as ProviderAwareness;
  }

  connect(): void {
    this.emitStatus("connected");
    // Seed the doc from `data.text` exactly once (an empty doc = first
    // connect). Applied with `this` as transaction origin so the block's
    // `Y.UndoManager` (which tracks NON-provider origins as local edits) never
    // captures the seed as a user edit. `shouldBootstrap={false}` means the
    // editor's initial content comes entirely from this seed.
    if (this.doc.store.clients.size === 0) {
      applyUpdate(this.doc, this.buildSeedState(), this);
    }
    // Announce sync so CollaborationPlugin's onSync bookkeeping runs against the
    // (now-seeded) doc. Re-announced on a StrictMode disconnect→connect too
    // (idempotent — `shouldBootstrap` is false, and the seed guard above skips
    // a re-apply when the doc already has content).
    this.emitSync(true);
  }

  disconnect(): void {
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

  // --- BlockDocProvider (transport contract) --------------------------------
  // No network, so the server-sync hooks are deliberate no-ops: there is no
  // stored doc row, no FK gate, and nothing to tear down asynchronously.

  markBlockRowConfirmed(): void {}

  onServerState(): void {}

  // Save state is CONSTANT: with no transport there is never an outstanding
  // flush, so the state can never change and a subscriber can never fire. The
  // unsubscribe is a no-op because nothing was ever subscribed, and `retryFlush`
  // has no queue to retry. The consumer reports this to the sync-status cloud
  // exactly as it does the server provider's — `idle` aggregates to silence.
  onSaveState(): () => void {
    return () => {};
  }

  getSaveState(): CollabSaveState {
    return IDLE_SAVE_STATE;
  }

  retryFlush(): void {}

  get readyForTeardown(): boolean {
    return true;
  }

  setTeardownReadyListener(): void {}

  destroy(): void {
    if (this.destroyed) return;
    this.disconnect();
    this.destroyed = true;
    this._awareness.destroy();
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
