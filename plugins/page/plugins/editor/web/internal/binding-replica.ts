import { applyUpdate, Doc, encodeStateAsUpdate } from "yjs";
import type { Provider, ProviderAwareness } from "@lexical/yjs";

/**
 * Per-binding replica doc for the block collab registry
 * (`research/2026-07-23-page-collab-binding-replicas.md`).
 *
 * ## The construction invariant
 *
 * `@lexical/yjs` hydrates Yjs→Lexical EXCLUSIVELY through the `observeDeep`
 * update events its binding registers on mount — a binding attached to an
 * already-populated doc never receives an event for the content the doc
 * already holds, so its editor renders empty forever, and typing there
 * computes deltas against a wrong (empty) baseline (see
 * `collab-provider-attach-order.test.ts` for the single-doc version of this
 * fact). With the registry sharing ONE canonical `Y.Doc` per block, a SECOND
 * simultaneous editor of the same block (inline nested-page expansion + the
 * page's own detail pane) is exactly that broken attach.
 *
 * The fix makes hydration a construction invariant: every Lexical binding
 * gets its own fresh **replica doc** that is EMPTY at attach time, and ALL
 * content — the initial state included — arrives as post-attach update
 * events. "Pre-populated at bind time" cannot exist, regardless of concurrent
 * editor count, mount order, or retained registry entries.
 *
 * ## The relay
 *
 * Canonical and replica are ordinary Yjs replicas of one CRDT converging via
 * update exchange — the same model as cross-client sync, just in-process and
 * synchronous:
 *
 * - canonical `update` → `Y.applyUpdate(replica, update, origin)`;
 * - replica `update` → `Y.applyUpdate(canonical, update, origin)`.
 *
 * The transaction origin is passed through VERBATIM. Origin passthrough (not
 * rewriting to a relay marker) is load-bearing — it preserves every existing
 * origin-discipline consumer unchanged:
 *
 * - the binding's own `origin !== binding` check (a replica's binding origin
 *   arriving at another replica is "not me" → processed);
 * - `isFromUndoManger` (`origin instanceof UndoManager`) selection handling
 *   when the canonical `Y.UndoManager` replays into the replicas;
 * - the canonical UndoManager's dynamic tracked-origin learning (a relayed
 *   binding origin is "not provider, not UndoManager" → tracked, exactly as a
 *   direct binding on the canonical was);
 * - the transport provider's flush trigger (`origin !== provider`), so
 *   relayed local edits still POST and relayed server states still don't.
 *
 * Loop prevention therefore CANNOT come from origins — it is a synchronous
 * re-entrancy latch per relay pair: Yjs fires `update` handlers synchronously
 * inside `applyUpdate`, so the echo of a relay's own apply arrives while the
 * latch is still held and is skipped. Residual cross-pair echoes (replica A's
 * update reaching canonical, canonical's event fanning to pair B, never back
 * to A) are idempotent no-op merges by CRDT construction.
 *
 * ## connect(): delegation to the canonical transport, then the initial state
 *
 * `CollaborationPlugin` now connects the REPLICA, so the replica must connect
 * the canonical transport — `LiveStateYjsProvider.onServerState` HOLDS a
 * delivered server state until its `connect()` ("never apply into a doc no
 * binding is watching"), and with nothing connecting it the held state would
 * never reach the canonical doc and every block would render empty. The
 * delegation is refcounted per registry entry ({@link CanonicalConnection},
 * shared by all replicas over one entry): the FIRST replica to connect
 * connects the transport — the canonical doc now has a binding watching,
 * through the relay — and the LAST to disconnect disconnects it, preserving
 * the transport's eager disconnect-flush on unmount.
 *
 * `connect()` therefore runs in this order:
 *
 *  1. attach the relay (and the canonical `sync` forward);
 *  2. delegate `CanonicalConnection.acquire()` — a synchronously-applied held
 *     server state relays into the replica through the already-attached relay;
 *  3. apply `encodeStateAsUpdate(canonical)` as catch-up, for content the
 *     canonical held from BEFORE this connect (e.g. a second editor joining a
 *     block another replica keeps connected).
 *
 * `CollaborationPlugin` (in `@lexical/react` 0.44, `useYjsCollaboration`)
 * declares its `observeDeep` effect BEFORE `useProvider`'s connect effect, so
 * both (2) and (3) land AFTER the binding attached → events fire → the
 * binding hydrates. The catch-up apply runs under the latch with this
 * provider as origin: the canonical already holds that state, so an
 * echo-relay back would be a no-op merge — skipped deliberately rather than
 * relied on.
 *
 * The relay listeners attach at `connect()` (not construction) and detach on
 * `disconnect()`: `providerFactory` runs render passes before the binding
 * exists, and content relayed into the replica in that window would be
 * pre-attach content — the exact bug class again. A reconnect (StrictMode's
 * simulated disconnect→connect) reattaches and re-applies the full canonical
 * state, so anything the replica missed while detached still arrives as
 * post-attach events.
 *
 * ## Sync + awareness delegation
 *
 * The canonical transport's `sync` events are forwarded to the replica's own
 * listeners while connected — `CollaborationPlugin` subscribes `sync` on the
 * provider it is handed, and before the replica layer it observed the
 * transport's announcements directly (e.g. the async doc-init handshake
 * completing). The replica additionally announces `sync(true)` itself at the
 * end of `connect()` (it then holds everything the canonical knows — and a
 * later-joining replica sees no transport transition to forward); a duplicate
 * announce is harmless, `shouldBootstrap` being false. Awareness is delegated
 * to the canonical provider's `Awareness` (one user-level awareness per
 * block, never broadcast — see `LiveStateYjsProvider`) instead of minting a
 * second one per binding.
 *
 * Lifecycle: owned by the hook hold in `use-collab-block-doc.ts` — created
 * lazily with the hold, deferred-destroyed alongside the entry release so it
 * survives StrictMode remounts (CollaborationPlugin never re-calls its
 * providerFactory on a simulated remount). `destroy()` detaches the relay and
 * destroys the replica doc; the canonical side is untouched.
 *
 * Events implemented (the exact set `CollaborationPlugin` listens for):
 * `sync` (isSynced) and `status` ({status}); `update`/`reload` are accepted
 * but never emitted (no doc reload in this transport).
 */
/**
 * The canonical-side provider surface a replica needs: the connection to
 * delegate, the awareness to hand through, and the `sync` announcements to
 * forward. A structural subset of the registry's `BlockDocProvider`, declared
 * here so this file stays a leaf (no import back into the registry module).
 */
export interface CanonicalProviderPort {
  readonly awareness: ProviderAwareness;
  connect(): void;
  disconnect(): void;
  on(type: "sync", cb: (isSynced: boolean) => void): void;
  off(type: "sync", cb: (isSynced: boolean) => void): void;
}

/**
 * Refcounted connect/disconnect delegation from a block's binding replicas to
 * its canonical transport provider (see the module comment). ONE instance per
 * registry entry, shared by every replica over that entry: the transport is
 * connected while at least one replica is, exactly as it was connected while
 * its single direct binding was before the replica layer.
 */
export class CanonicalConnection {
  private readonly provider: CanonicalProviderPort;
  private connectedReplicas = 0;

  constructor(provider: CanonicalProviderPort) {
    this.provider = provider;
  }

  acquire(): void {
    this.connectedReplicas += 1;
    if (this.connectedReplicas === 1) this.provider.connect();
  }

  release(): void {
    this.connectedReplicas -= 1;
    if (this.connectedReplicas < 0) {
      // A replica released more than it acquired — a lifecycle bug upstream.
      throw new Error("CanonicalConnection: release() without matching acquire()");
    }
    if (this.connectedReplicas === 0) this.provider.disconnect();
  }
}

export class BindingReplica implements Provider {
  /** The fresh per-binding doc CollaborationPlugin's binding attaches to. */
  readonly replicaDoc = new Doc();
  private readonly canonical: Doc;
  private readonly canonicalProvider: CanonicalProviderPort;
  private readonly connection: CanonicalConnection;

  /**
   * The synchronous re-entrancy latch (see the module comment): true while
   * this pair is applying a relayed update, so the apply's own synchronous
   * echo on the other doc is skipped instead of relaying forever.
   */
  private relaying = false;
  private relayAttached = false;
  /** This replica's own share of the refcounted canonical connection. */
  private canonicalConnected = false;
  private destroyed = false;

  private readonly syncListeners = new Set<(isSynced: boolean) => void>();
  private readonly statusListeners = new Set<(arg: { status: string }) => void>();
  private readonly updateListeners = new Set<(arg: unknown) => void>();
  private readonly reloadListeners = new Set<(doc: Doc) => void>();

  constructor(
    canonical: Doc,
    canonicalProvider: CanonicalProviderPort,
    connection: CanonicalConnection,
  ) {
    this.canonical = canonical;
    this.canonicalProvider = canonicalProvider;
    this.connection = connection;
  }

  get awareness(): ProviderAwareness {
    return this.canonicalProvider.awareness;
  }

  /** Forward the transport's sync announcements (see the module comment). */
  private readonly forwardSync = (isSynced: boolean): void => {
    this.emitSync(isSynced);
  };

  private readonly onCanonicalUpdate = (update: Uint8Array, origin: unknown): void => {
    if (this.relaying) return;
    this.relaying = true;
    try {
      applyUpdate(this.replicaDoc, update, origin);
    } finally {
      this.relaying = false;
    }
  };

  private readonly onReplicaUpdate = (update: Uint8Array, origin: unknown): void => {
    if (this.relaying) return;
    this.relaying = true;
    try {
      applyUpdate(this.canonical, update, origin);
    } finally {
      this.relaying = false;
    }
  };

  // --- Provider interface ---------------------------------------------------

  connect(): void {
    if (this.destroyed) {
      // A destroyed replica reconnecting means the deferred destroy fired for
      // a binding that still lives — a lifecycle bug, never a valid state.
      throw new Error("BindingReplica: connect() after destroy()");
    }
    // (1) Relay + sync-forward FIRST: the delegated transport connect below
    // may synchronously apply a held server state to the canonical — those
    // update events must reach the replica through an already-attached relay.
    if (!this.relayAttached) {
      this.relayAttached = true;
      this.canonical.on("update", this.onCanonicalUpdate);
      this.replicaDoc.on("update", this.onReplicaUpdate);
      this.canonicalProvider.on("sync", this.forwardSync);
    }
    this.emitStatus("connected");
    // (2) Refcounted transport delegation: the first connected replica per
    // entry connects the canonical transport (see CanonicalConnection).
    if (!this.canonicalConnected) {
      this.canonicalConnected = true;
      this.connection.acquire();
    }
    // (3) Catch-up state — content the canonical held from BEFORE this
    // connect (a second editor joining, a reconnect after a detached window).
    // Applied AFTER the binding's observeDeep attached (see the module
    // comment), so it lands as events the binding hydrates from. Latched —
    // the canonical already holds this state.
    this.relaying = true;
    try {
      applyUpdate(this.replicaDoc, encodeStateAsUpdate(this.canonical), this);
    } finally {
      this.relaying = false;
    }
    this.emitSync(true);
  }

  disconnect(): void {
    if (this.canonicalConnected) {
      this.canonicalConnected = false;
      this.connection.release(); // last replica out disconnects the transport
    }
    if (this.relayAttached) {
      this.relayAttached = false;
      this.canonical.off("update", this.onCanonicalUpdate);
      this.replicaDoc.off("update", this.onReplicaUpdate);
      this.canonicalProvider.off("sync", this.forwardSync);
    }
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

  // --- Lifecycle ------------------------------------------------------------

  /** Detach the relay and destroy the replica doc (canonical untouched). Idempotent. */
  destroy(): void {
    if (this.destroyed) return;
    this.disconnect();
    this.destroyed = true;
    this.replicaDoc.destroy();
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
