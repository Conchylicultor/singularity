// Structural transport interfaces — the injection seam for SharedWebSocket and
// its SharedWorker host. Each interface covers ONLY the members the production
// code actually touches, so a fake never has to implement a full DOM type and
// the real globals (`new WebSocket(...)`, `new SharedWorker(...)`,
// `navigator.locks`) stay assignable as the defaults.
//
// Mirrors the server half's injection philosophy (resource-runtime's
// `ResourceRuntimeOptions` hooks): production wires the globals, tests wire the
// deterministic fakes in `./testing`. See
// `research/2026-07-03-global-live-state-client-transport-harness.md` and
// `research/2026-10-08-networking-shared-worker-transport.md`.

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

/** The subset of `MessagePort` both ends of the SharedWorker protocol use. */
export interface MessagePortLike {
  onmessage: ((ev: MessageEvent) => void) | null;
  postMessage(data: unknown): void;
  close(): void;
}

/** The subset of `SharedWorker` the tab uses. */
export interface SharedWorkerLike {
  readonly port: MessagePortLike;
  onerror: ((ev: ErrorEvent) => void) | null;
}

/**
 * Factory for the SharedWorker owning one URL's socket, given its worker name;
 * the default constructs the real worker script bundled next to this module.
 */
export type MakeSharedWorker = (name: string) => SharedWorkerLike;

/**
 * The single method of `navigator.locks` this stack calls (exclusive locks
 * only). The callback's return is widened to `Promise<void> | void`: the tab
 * returns a pending promise to hold its liveness lock, the worker returns
 * nothing (it only wants to learn the moment the lock frees).
 */
export interface LockManagerLike {
  request(
    name: string,
    options: { mode: "exclusive" },
    callback: () => Promise<void> | void,
  ): Promise<void>;
}
