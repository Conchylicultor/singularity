// Network-diagnostics event bus. Mirrors ws-status-bus.ts: a module-level
// listener Set with publish/subscribe. The networking layer only *publishes*
// transition events here (shared-websocket republishes the events its
// SharedWorker reports, since the worker realm has no bus of its own); a
// subscriber living *above* networking (live-state) forwards them to the
// persistent log channel. This keeps networking free of any log-channels
// dependency, avoiding the networking ↔ log-channels import cycle.

export type NetDiagEvent =
  // --- socket lifecycle (socket-owner.ts, inside the SharedWorker) ---
  | { type: "ws-open"; url: string }
  | { type: "ws-close"; url: string }
  | { type: "ws-reconnect-scheduled"; url: string; attempt: number }
  // --- tab ports joining / leaving the SharedWorker (shared-ws-host.ts) ---
  | { type: "port-attached"; url: string; ports: number }
  | {
      type: "port-released";
      url: string;
      ports: number;
      reason: "detach" | "gone";
    };

type Listener = (ev: NetDiagEvent) => void;

const listeners = new Set<Listener>();

export function publishNetDiag(ev: NetDiagEvent): void {
  for (const fn of listeners) fn(ev);
}

export function subscribeNetDiag(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
