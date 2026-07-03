// Structural transport interfaces — the injection seam for SharedWebSocket /
// CrossTabElection. Each interface covers ONLY the members the production code
// actually touches, so a fake never has to implement a full DOM type and the
// real globals (`new WebSocket(...)`, `new BroadcastChannel(...)`,
// `navigator.locks`) stay assignable as the defaults.
//
// Mirrors the server half's injection philosophy (resource-runtime's
// `ResourceRuntimeOptions` hooks): production wires the globals, tests wire the
// deterministic fakes in `./test-support`. See
// `research/2026-07-03-global-live-state-client-transport-harness.md`.

/** The string-message subset of the native `WebSocket` API this stack uses. */
export interface WebSocketLike {
  readyState: number;
  onopen: ((ev: Event) => void) | null;
  onmessage: ((ev: MessageEvent<string>) => void) | null;
  onclose: ((ev: CloseEvent) => void) | null;
  onerror: ((ev: Event) => void) | null;
  send(data: string): void;
  close(): void;
}

/** Factory for a `WebSocketLike`; the default is `(u) => new WebSocket(u)`. */
export type MakeWebSocket = (url: string) => WebSocketLike;

/** The subset of `BroadcastChannel` the cross-tab election uses. */
export interface BroadcastChannelLike {
  onmessage: ((ev: MessageEvent) => void) | null;
  postMessage(data: unknown): void;
  close(): void;
}

/** Factory for a `BroadcastChannelLike`; the default is `(n) => new BroadcastChannel(n)`. */
export type MakeBroadcastChannel = (name: string) => BroadcastChannelLike;

/**
 * The single method of `navigator.locks` the election calls. The callback's
 * return is widened to `Promise<void> | void` (the plan's `() => Promise<void>`
 * cannot type the real handler): the election's grant callback early-returns
 * `undefined` on the closed path — `void` accepts that while the leader path
 * still returns a never-resolving `Promise<void>` to hold the lock.
 */
export interface LockManagerLike {
  request(
    name: string,
    options: { mode?: "exclusive" | "shared"; steal?: boolean },
    callback: () => Promise<void> | void,
  ): Promise<void>;
}
