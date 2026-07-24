import { describe, expect, test } from "bun:test";
import * as Y from "yjs";
import type { ProviderAwareness } from "@lexical/yjs";
import {
  BindingReplica,
  CanonicalConnection,
  type CanonicalProviderPort,
} from "./binding-replica";

/**
 * The per-binding replica invariant (`binding-replica.ts`): a Lexical binding
 * always attaches to an EMPTY doc, and ALL content — the initial state of an
 * already-populated canonical included — arrives as post-attach update events
 * the binding can hydrate from. Plus the relay's origin passthrough (the
 * canonical UndoManager / transport provider / other bindings see the true
 * origin), the synchronous re-entrancy latch (relays terminate, echoes are
 * deliberate skips), and the refcounted connect/disconnect delegation to the
 * canonical transport — which HOLDS a delivered server state until its own
 * connect(), so a replica that failed to delegate would leave every block
 * empty on a fresh page load.
 */

/** Inert awareness stub — the replica only delegates it, never calls it. */
const awareness: ProviderAwareness = {
  getLocalState: () => null,
  getStates: () => new Map(),
  off: () => {},
  on: () => {},
  setLocalState: () => {},
  setLocalStateField: () => {},
};

/**
 * Faithful stand-in for the canonical transport (`LiveStateYjsProvider`)'s
 * connect-gated ingestion: a state delivered via {@link onServerState} is
 * HELD until connect() ("never apply into a doc no binding is watching") and
 * applied with the provider as origin; sync is announced once applied. This
 * is the behavior that made the delegation load-bearing — a test driving only
 * a pre-populated canonical doc cannot catch a replica that never connects
 * the transport.
 */
class FakeTransportProvider implements CanonicalProviderPort {
  readonly awareness = awareness;
  connectCalls = 0;
  disconnectCalls = 0;

  private readonly doc: Y.Doc;
  private connected = false;
  private held: Uint8Array | null = null;
  private readonly syncListeners = new Set<(isSynced: boolean) => void>();

  constructor(doc: Y.Doc) {
    this.doc = doc;
  }

  onServerState(state: Uint8Array): void {
    this.held = state;
    if (this.connected) this.applyHeld();
  }

  connect(): void {
    this.connectCalls += 1;
    this.connected = true;
    this.applyHeld();
  }

  disconnect(): void {
    this.disconnectCalls += 1;
    this.connected = false;
  }

  on(_type: "sync", cb: (isSynced: boolean) => void): void {
    this.syncListeners.add(cb);
  }

  off(_type: "sync", cb: (isSynced: boolean) => void): void {
    this.syncListeners.delete(cb);
  }

  emitSync(isSynced: boolean): void {
    for (const cb of [...this.syncListeners]) cb(isSynced);
  }

  private applyHeld(): void {
    if (this.held === null) return;
    const state = this.held;
    this.held = null;
    Y.applyUpdate(this.doc, state, this);
    this.emitSync(true);
  }
}

/** One canonical entry's worth of collab state: doc + transport + shared connection. */
function makeCanonical(text = ""): {
  doc: Y.Doc;
  root: Y.XmlText;
  transport: FakeTransportProvider;
  newReplica: () => BindingReplica;
} {
  const doc = new Y.Doc();
  const root = doc.get("root", Y.XmlText);
  if (text.length > 0) root.insert(0, text);
  const transport = new FakeTransportProvider(doc);
  const connection = new CanonicalConnection(transport);
  return {
    doc,
    root,
    transport,
    newReplica: () => new BindingReplica(doc, transport, connection),
  };
}

/** Encode `text` as the state bytes a stored server doc would ship. */
function serverState(text: string): Uint8Array {
  const d = new Y.Doc();
  d.get("root", Y.XmlText).insert(0, text);
  return Y.encodeStateAsUpdate(d);
}

/**
 * Stand in for the Lexical binding on a replica: the `observeDeep` observer it
 * registers BEFORE the provider's connect() runs (the `@lexical/react` 0.44
 * effect order), plus the doc-level update count.
 */
function attachBinding(replica: BindingReplica): {
  root: Y.XmlText;
  deepEvents: number;
  updates: number;
  origins: unknown[];
} {
  const seen = {
    root: replica.replicaDoc.get("root", Y.XmlText),
    deepEvents: 0,
    updates: 0,
    origins: [] as unknown[],
  };
  seen.root.observeDeep(() => {
    seen.deepEvents += 1;
  });
  replica.replicaDoc.on("update", (_update: Uint8Array, origin: unknown) => {
    seen.updates += 1;
    seen.origins.push(origin);
  });
  return seen;
}

describe("BindingReplica — hydration is a construction invariant", () => {
  test("a replica over a POPULATED canonical is empty at attach and hydrates via post-attach events on connect()", () => {
    const canonical = makeCanonical("hello");
    const replica = canonical.newReplica();
    const binding = attachBinding(replica);

    // The doc the binding attached to holds nothing — by construction.
    expect(binding.root.toString()).toBe("");
    expect(binding.deepEvents).toBe(0);

    const statuses: string[] = [];
    const syncs: boolean[] = [];
    replica.on("status", ({ status }) => statuses.push(status));
    replica.on("sync", (isSynced) => syncs.push(isSynced));

    replica.connect();

    // The full canonical state landed AFTER attach, as observable events.
    expect(binding.deepEvents).toBe(1);
    expect(binding.updates).toBe(1);
    expect(binding.root.toString()).toBe("hello");
    expect(statuses).toEqual(["connected"]);
    expect(syncs).toEqual([true]);
    replica.destroy();
  });

  test("a server state HELD by an unconnected transport flows to the binding through the replica's connect()", () => {
    // The fresh-page-load regression path: the subscription delivers the
    // stored state before any binding exists; the transport holds it; nothing
    // else ever connects the transport — the replica's delegation must.
    const canonical = makeCanonical();
    canonical.transport.onServerState(serverState("stored"));
    expect(canonical.root.toString()).toBe(""); // held, not applied

    const replica = canonical.newReplica();
    const binding = attachBinding(replica);
    replica.connect();

    expect(canonical.transport.connectCalls).toBe(1);
    expect(canonical.root.toString()).toBe("stored");
    // …and it reached the replica THROUGH the relay, post-attach, as events.
    expect(binding.deepEvents).toBe(1);
    expect(binding.root.toString()).toBe("stored");
    replica.destroy();
  });

  test("a second replica joining a block another replica keeps connected hydrates from the catch-up apply", () => {
    const canonical = makeCanonical();
    canonical.transport.onServerState(serverState("stored"));
    const replicaA = canonical.newReplica();
    attachBinding(replicaA);
    replicaA.connect(); // transport connects, held state applied + relayed

    const replicaB = canonical.newReplica();
    const bindingB = attachBinding(replicaB);
    expect(bindingB.root.toString()).toBe("");
    replicaB.connect();

    // No transport transition (already connected) — B hydrated from the
    // catch-up encodeStateAsUpdate(canonical) apply, still post-attach.
    expect(canonical.transport.connectCalls).toBe(1);
    expect(bindingB.deepEvents).toBe(1);
    expect(bindingB.root.toString()).toBe("stored");
    replicaA.destroy();
    replicaB.destroy();
  });

  test("connect() against a populated canonical never echo-relays back into the canonical", () => {
    const canonical = makeCanonical("hello");
    let canonicalUpdates = 0;
    canonical.doc.on("update", () => {
      canonicalUpdates += 1;
    });
    const replica = canonical.newReplica();
    attachBinding(replica);
    replica.connect();
    expect(canonicalUpdates).toBe(0);
    replica.destroy();
  });

  test("StrictMode disconnect→connect: content the replica missed while detached still arrives as post-attach events", () => {
    const canonical = makeCanonical("hello");
    const replica = canonical.newReplica();
    const binding = attachBinding(replica);
    replica.connect();
    replica.disconnect();

    // Detached: a canonical change does not reach the replica…
    canonical.root.insert(5, " world");
    expect(binding.root.toString()).toBe("hello");
    const eventsBefore = binding.deepEvents;

    // …and the reconnect's full-state apply delivers it as a fresh event.
    replica.connect();
    expect(binding.deepEvents).toBe(eventsBefore + 1);
    expect(binding.root.toString()).toBe("hello world");
    replica.destroy();
  });
});

describe("BindingReplica — canonical transport delegation", () => {
  test("refcounted: first replica connect connects the transport, last disconnect disconnects it", () => {
    const canonical = makeCanonical();
    const replicaA = canonical.newReplica();
    const replicaB = canonical.newReplica();
    attachBinding(replicaA);
    attachBinding(replicaB);

    replicaA.connect();
    expect(canonical.transport.connectCalls).toBe(1);
    replicaB.connect();
    expect(canonical.transport.connectCalls).toBe(1); // already connected

    replicaA.disconnect();
    expect(canonical.transport.disconnectCalls).toBe(0); // B still holds it
    replicaB.disconnect();
    expect(canonical.transport.disconnectCalls).toBe(1); // last one out

    // A full reconnect cycle delegates again (the transport's reconnect path).
    replicaA.connect();
    expect(canonical.transport.connectCalls).toBe(2);
    replicaA.destroy();
    expect(canonical.transport.disconnectCalls).toBe(2); // destroy releases too
    replicaB.destroy();
  });

  test("a replica's repeated connect() acquires its share only once", () => {
    const canonical = makeCanonical();
    const replica = canonical.newReplica();
    attachBinding(replica);
    replica.connect();
    replica.connect();
    expect(canonical.transport.connectCalls).toBe(1);
    replica.disconnect();
    expect(canonical.transport.disconnectCalls).toBe(1); // balanced, not negative
    replica.destroy();
    expect(canonical.transport.disconnectCalls).toBe(1);
  });

  test("the transport's async sync announcements are forwarded to the replica's listeners", () => {
    // e.g. the doc-init handshake completing after connect: markSynced emits
    // sync(true) on the transport — CollaborationPlugin subscribed on the
    // replica, so the replica must forward it.
    const canonical = makeCanonical();
    const replica = canonical.newReplica();
    attachBinding(replica);
    const syncs: boolean[] = [];
    replica.on("sync", (isSynced) => syncs.push(isSynced));
    replica.connect();
    const afterConnect = syncs.length;

    canonical.transport.emitSync(true);
    expect(syncs.length).toBe(afterConnect + 1);

    // Detached after disconnect — no forwarding to a binding that is gone.
    replica.disconnect();
    canonical.transport.emitSync(true);
    expect(syncs.length).toBe(afterConnect + 1);
    replica.destroy();
  });
});

describe("BindingReplica — bidirectional relay with origin passthrough", () => {
  test("an edit on replica A reaches the canonical AND replica B, carrying the original transaction origin", () => {
    const canonical = makeCanonical("base");
    const canonicalOrigins: unknown[] = [];
    canonical.doc.on("update", (_u: Uint8Array, origin: unknown) => {
      canonicalOrigins.push(origin);
    });

    const replicaA = canonical.newReplica();
    const replicaB = canonical.newReplica();
    const bindingA = attachBinding(replicaA);
    const bindingB = attachBinding(replicaB);
    replicaA.connect();
    replicaB.connect();

    const bindingOriginA = { binding: "A" };
    replicaA.replicaDoc.transact(() => {
      bindingA.root.insert(4, "+typed");
    }, bindingOriginA);

    expect(canonical.root.toString()).toBe("base+typed");
    expect(bindingB.root.toString()).toBe("base+typed");
    // Passthrough: the canonical and replica B both saw A's binding origin
    // verbatim (transport flush trigger + UndoManager origin learning depend
    // on it), never a relay-minted marker.
    expect(canonicalOrigins).toEqual([bindingOriginA]);
    expect(bindingB.origins.at(-1)).toBe(bindingOriginA);
    replicaA.destroy();
    replicaB.destroy();
  });

  test("the relay terminates (latch): one edit produces exactly one update per doc, no duplicated content", () => {
    const canonical = makeCanonical();
    let canonicalUpdates = 0;
    canonical.doc.on("update", () => {
      canonicalUpdates += 1;
    });
    const replicaA = canonical.newReplica();
    const replicaB = canonical.newReplica();
    const bindingA = attachBinding(replicaA);
    const bindingB = attachBinding(replicaB);
    replicaA.connect();
    replicaB.connect();

    replicaA.replicaDoc.transact(() => {
      bindingA.root.insert(0, "once");
    }, "bindingA");

    expect(canonicalUpdates).toBe(1);
    expect(bindingA.updates).toBe(1); // its own transaction, no echo re-apply
    expect(bindingB.updates).toBe(1); // the relayed copy, exactly once
    expect(canonical.root.toString()).toBe("once");
    expect(bindingA.root.toString()).toBe("once");
    expect(bindingB.root.toString()).toBe("once");
    replicaA.destroy();
    replicaB.destroy();
  });

  test("a canonical UndoManager undo of a replica-originated edit is reflected in both replicas as an UndoManager-origin event", () => {
    const canonical = makeCanonical("base");
    const replicaA = canonical.newReplica();
    const replicaB = canonical.newReplica();
    const bindingA = attachBinding(replicaA);
    const bindingB = attachBinding(replicaB);
    replicaA.connect();
    replicaB.connect();

    // The registry's UndoManager learns binding origins dynamically; here the
    // tracked origin is declared up front — same effect for one origin.
    const bindingOriginA = { binding: "A" };
    const um = new Y.UndoManager(canonical.root, {
      trackedOrigins: new Set([bindingOriginA]),
    });

    replicaA.replicaDoc.transact(() => {
      bindingA.root.insert(4, "+typed");
    }, bindingOriginA);
    expect(um.undoStack.length).toBe(1); // the relayed edit was captured

    um.undo();

    expect(canonical.root.toString()).toBe("base");
    expect(bindingA.root.toString()).toBe("base");
    expect(bindingB.root.toString()).toBe("base");
    // Passthrough again: both bindings can see `origin instanceof UndoManager`
    // (the isFromUndoManger selection handling in @lexical/yjs).
    expect(bindingA.origins.at(-1)).toBe(um);
    expect(bindingB.origins.at(-1)).toBe(um);
    replicaA.destroy();
    replicaB.destroy();
  });

  test("re-delivering state the other side already holds is a no-op (echoes are idempotent)", () => {
    const canonical = makeCanonical("hello");
    const replica = canonical.newReplica();
    const binding = attachBinding(replica);
    replica.connect();

    // The canonical merging a state it already holds emits nothing, so the
    // relay has nothing to forward — and a hypothetical forward would merge
    // as a no-op on the replica too.
    Y.applyUpdate(canonical.doc, Y.encodeStateAsUpdate(replica.replicaDoc), "server");
    expect(canonical.root.toString()).toBe("hello");
    expect(binding.root.toString()).toBe("hello");
    expect(binding.updates).toBe(1); // only the connect() hydration
    replica.destroy();
  });
});

describe("BindingReplica — lifecycle", () => {
  test("destroy() detaches the relay in both directions; other replicas keep working", () => {
    const canonical = makeCanonical("base");
    let canonicalUpdates = 0;
    canonical.doc.on("update", () => {
      canonicalUpdates += 1;
    });
    const replicaA = canonical.newReplica();
    const replicaB = canonical.newReplica();
    const bindingA = attachBinding(replicaA);
    const bindingB = attachBinding(replicaB);
    replicaA.connect();
    replicaB.connect();

    const detachedDoc = replicaA.replicaDoc;
    const detachedRoot = bindingA.root;
    replicaA.destroy();

    // An edit on the destroyed replica's doc no longer relays anywhere.
    detachedDoc.transact(() => {
      detachedRoot.insert(4, "+stranded");
    }, "bindingA");
    expect(canonicalUpdates).toBe(0);
    expect(canonical.root.toString()).toBe("base");

    // The canonical↔B pair is unaffected.
    canonical.root.insert(4, "+more");
    expect(bindingB.root.toString()).toBe("base+more");
    replicaB.destroy();
  });

  test("connect() after destroy() fails loudly (a canceled deferred destroy bug, not a valid state)", () => {
    const canonical = makeCanonical();
    const replica = canonical.newReplica();
    replica.destroy();
    expect(() => replica.connect()).toThrow("connect() after destroy()");
  });

  test("awareness is the canonical provider's, delegated — not a second minted one", () => {
    const canonical = makeCanonical();
    const replica = canonical.newReplica();
    expect(replica.awareness).toBe(awareness);
    replica.destroy();
  });
});
