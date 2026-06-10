// Network-diagnostics event bus. Mirrors ws-status-bus.ts: a module-level
// listener Set with publish/subscribe. The networking layer (shared-websocket,
// cross-tab-election) only *publishes* transition events here; a subscriber
// living *above* networking (live-state) forwards them to the persistent log
// channel. This keeps networking free of any log-channels dependency, avoiding
// the networking ↔ log-channels import cycle.

export type NetDiagEvent =
  // --- socket lifecycle (shared-websocket.ts) ---
  | { type: "ws-open"; url: string }
  | { type: "ws-close"; url: string }
  | { type: "ws-reconnect-scheduled"; url: string; attempt: number }
  // --- cross-tab election transitions (cross-tab-election.ts) ---
  | { type: "elected"; name: string }
  | { type: "demoted"; name: string }
  | { type: "steal-attempt"; name: string }
  | { type: "leader-timeout"; name: string }
  | { type: "follower-joined"; name: string };

type Listener = (ev: NetDiagEvent) => void;

const listeners = new Set<Listener>();

export function publishNetDiag(ev: NetDiagEvent): void {
  for (const fn of listeners) fn(ev);
}

export function subscribeNetDiag(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
