/**
 * Deterministic transport fakes for the client live-state harness. Plain `.ts`
 * (NOT `.test.ts`, and NO `vitest`/`bun:test` import) so neither runner ever
 * collects it as a suite and BOTH plugins' suites (networking's own
 * cross-tab-election / shared-websocket tests, and live-state's notifications
 * tests) can import the identical fakes. Barrel-exported from
 * `networking/web/index.ts` because the boundary rules only let live-state reach
 * these across the plugin edge through the runtime barrel.
 *
 * The design mirrors resource-runtime's server-side `test-support.ts`: the fakes
 * are dumb and *scriptable*, never smart mocks. A test drives them by hand
 * (`open()`, `serverSend(frame)`, `kill(tab)`) and asserts on what the REAL
 * production classes did in response — the version guard, keyed-delta merge,
 * election handover, backoff, and keep-alive timers are all exercised for real;
 * only the three OS globals (`WebSocket`, `BroadcastChannel`, `navigator.locks`)
 * are faked. See
 * `research/2026-07-03-global-live-state-client-transport-harness.md`.
 *
 * Two mechanics are load-bearing for correct fake-timer interleaving (vitest
 * fakes `setTimeout`/`setInterval`/`Date` but NEVER microtasks):
 *   - BroadcastChannel delivery and lock grants happen on the REAL microtask
 *     queue (`Promise.resolve().then` / `queueMicrotask`), so a test flushes them
 *     with `await vi.advanceTimersByTimeAsync(0)` between faked timers.
 *   - `serverSend` is dropped unless the socket is OPEN — modelling the reopen
 *     gap (a frame to a closed/connecting socket is silently lost), the exact
 *     hazard H1 pins.
 */

import { SharedWebSocket, type SharedWebSocketHooks } from "./shared-websocket";
import type { WebSocketLike, LockManagerLike } from "./transport-types";

const WS_OPEN = 1;
const WS_CLOSED = 3;

// Test-scaled election timers (production: 4_000 / 12_000). Small so a fake-timer
// test advances a handover in a couple of `advanceTimersByTimeAsync` calls; the
// 1:3 heartbeat:timeout ratio is preserved so a live heartbeat still refreshes
// the follower well inside its staleness window.
export const HUB_HEARTBEAT_MS = 40;
export const HUB_TIMEOUT_MS = 120;

// --- FakeWebSocket + FakeWsServer ------------------------------------------

/**
 * A `WebSocketLike` with no network. Handlers are assigned by `SharedWebSocket`
 * AFTER construction (never fired synchronously in the constructor), so a test
 * drives lifecycle explicitly: `open()` fires `onopen`, `serverSend` fires
 * `onmessage` (only while OPEN), `serverClose` fires `onclose` (→ reconnect).
 * Client → server frames are captured in `sent`.
 */
export class FakeWebSocket implements WebSocketLike {
  readyState = 0; // CONNECTING
  onopen: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent<string>) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  /** Raw frames the production code wrote via `send`, in order. */
  readonly sent: string[] = [];

  constructor(
    readonly url: string,
    private server: FakeWsServer,
  ) {}

  // --- production-facing (WebSocketLike) ---

  send(data: string): void {
    this.sent.push(data);
    this.server.notifyFrame(this, data);
  }

  close(): void {
    if (this.readyState === WS_CLOSED) return;
    this.readyState = WS_CLOSED;
  }

  // --- test affordances ---

  /** Complete the connection: OPEN + fire `onopen`. */
  open(): void {
    if (this.readyState !== 0) return;
    this.readyState = WS_OPEN;
    this.onopen?.(new Event("open"));
  }

  /**
   * Deliver a server → client frame. GUARDED on OPEN: a frame to a
   * closed/connecting socket is silently lost (the reopen gap, hazard H1).
   */
  serverSend(frame: string | object): void {
    if (this.readyState !== WS_OPEN) return;
    const data = typeof frame === "string" ? frame : JSON.stringify(frame);
    this.onmessage?.(new MessageEvent<string>("message", { data }));
  }

  /** Server-initiated close: CLOSED + fire `onclose` (drives the reconnect path). */
  serverClose(code = 1006): void {
    if (this.readyState === WS_CLOSED) return;
    this.readyState = WS_CLOSED;
    this.onclose?.(new CloseEvent("close", { code, wasClean: false }));
  }

  /** Parsed client → server frames, with pings filtered out. */
  sentJson(): Record<string, unknown>[] {
    return this.sent
      .map((s) => JSON.parse(s) as Record<string, unknown>)
      .filter((m) => m.kind !== "ping" && m.op !== "ping");
  }
}

export interface FakeWsServerOptions {
  /**
   * Optional auto-responder: invoked for every client → server frame. Lets a
   * multi-sub test script sub-acks without hand-delivering each. The server fake
   * stays dumb — this is a scripted hook, not a smart mock.
   */
  onFrame?: (socket: FakeWebSocket, frame: string) => void;
}

/**
 * A no-network WebSocket server: `connect` is the bound `makeWebSocket` factory;
 * every socket it ever handed out is retained for introspection (`all`), and the
 * currently-OPEN subset (`openSockets`) is derived live from `readyState` so it
 * is the single source of truth for the one-socket invariant.
 */
export class FakeWsServer {
  private sockets: FakeWebSocket[] = [];
  onFrame?: (socket: FakeWebSocket, frame: string) => void;

  constructor(opts: FakeWsServerOptions = {}) {
    this.onFrame = opts.onFrame;
  }

  /** Bound WebSocket factory — pass as a `makeWebSocket` hook. */
  connect = (url: string): FakeWebSocket => {
    const ws = new FakeWebSocket(url, this);
    this.sockets.push(ws);
    return ws;
  };

  /** Every socket ever created (open or closed), in creation order. */
  all(): FakeWebSocket[] {
    return [...this.sockets];
  }

  /** Only the currently-OPEN sockets — the one-live-socket invariant reads this. */
  openSockets(): FakeWebSocket[] {
    return this.sockets.filter((s) => s.readyState === WS_OPEN);
  }

  /** Close every OPEN socket (models a backend restart dropping the fleet). */
  restart(): void {
    for (const ws of this.openSockets()) ws.serverClose();
  }

  /** Internal: forward a client-sent frame to the auto-responder, if any. */
  notifyFrame(socket: FakeWebSocket, frame: string): void {
    this.onFrame?.(socket, frame);
  }
}

// --- FakeBroadcastChannelBus ------------------------------------------------

/**
 * A single `BroadcastChannel` endpoint. `postMessage` fans out to every OTHER
 * same-name channel (never self — the real API never echoes to the sender, and
 * the election's hello/hb frames rely on that), asynchronously on the real
 * microtask queue.
 */
export class FakeBroadcastChannel {
  onmessage: ((ev: MessageEvent) => void) | null = null;
  closed = false;

  constructor(
    readonly name: string,
    private bus: FakeBroadcastChannelBus,
  ) {}

  postMessage(data: unknown): void {
    if (this.closed) return;
    this.bus.post(this, data);
  }

  close(): void {
    this.closed = true;
    this.bus.remove(this);
  }
}

/**
 * A cross-tab BroadcastChannel fabric: `channel(name)` is the bound
 * `makeBroadcastChannel` factory. Payloads are `structuredClone`d per recipient
 * so "tabs" can never share a reference. `freeze(channel)` models a frozen tab:
 * the channel stays registered (so its lock is still held — steal-required
 * handover) but goes silent in BOTH directions.
 */
export class FakeBroadcastChannelBus {
  private groups = new Map<string, Set<FakeBroadcastChannel>>();
  private frozen = new Set<FakeBroadcastChannel>();

  /** Bound factory — pass as a `makeBroadcastChannel` hook. */
  channel = (name: string): FakeBroadcastChannel => {
    const ch = new FakeBroadcastChannel(name, this);
    let group = this.groups.get(name);
    if (!group) {
      group = new Set();
      this.groups.set(name, group);
    }
    group.add(ch);
    return ch;
  };

  /** Silence a channel in both directions (its lock stays held elsewhere). */
  freeze(channel: FakeBroadcastChannel): void {
    this.frozen.add(channel);
  }

  post(from: FakeBroadcastChannel, data: unknown): void {
    if (this.frozen.has(from)) return; // a frozen tab cannot send
    const group = this.groups.get(from.name);
    if (!group) return;
    for (const ch of group) {
      if (ch === from) continue; // never echo to the sender
      // Deliver on a REAL microtask; re-check liveness at delivery time (a tab
      // may have closed or frozen between post and delivery).
      void Promise.resolve().then(() => {
        if (ch.closed || this.frozen.has(ch)) return;
        ch.onmessage?.(new MessageEvent("message", { data: structuredClone(data) }));
      });
    }
  }

  remove(channel: FakeBroadcastChannel): void {
    this.groups.get(channel.name)?.delete(channel);
  }
}

// --- FakeLockManager --------------------------------------------------------

interface LockRequest {
  cb: () => Promise<void> | void;
  resolve: () => void;
  reject: (err: unknown) => void;
  /** Set once the request has been resolved or rejected (guards double-settle). */
  settled: boolean;
}

interface LockState {
  holder: LockRequest | null;
  queue: LockRequest[];
}

/**
 * A `navigator.locks`-shaped exclusive lock, promise-based like the real API.
 * Grants happen on a microtask (a synchronous grant would re-enter the
 * `SharedWebSocket`/`CrossTabElection` constructor in a way real code never
 * sees). One holder per name — enforced by an invariant that THROWS on
 * violation, so a handover bug surfaces loudly instead of silently double-leading.
 *
 * Handover models:
 *   - `steal: true` — rejects the current holder's outer request promise with
 *     `DOMException("stolen","AbortError")` (→ `demoteToFollower`) and installs
 *     the stealer; queued waiters stay queued.
 *   - `releaseTab(name)` — a cleanly-closed tab: the holder is released WITHOUT
 *     an AbortError (its promise resolves, no demotion), and the next queued
 *     waiter is granted.
 */
export class FakeLockManager implements LockManagerLike {
  private states = new Map<string, LockState>();

  request(
    name: string,
    options: { mode?: "exclusive" | "shared"; steal?: boolean },
    callback: () => Promise<void> | void,
  ): Promise<void> {
    const steal = options.steal ?? false;
    const state = this.state(name);
    return new Promise<void>((resolve, reject) => {
      const entry: LockRequest = { cb: callback, resolve, reject, settled: false };
      if (steal) {
        queueMicrotask(() => {
          const cur = state.holder;
          if (cur && !cur.settled) {
            cur.settled = true;
            state.holder = null;
            cur.reject(new DOMException("stolen", "AbortError"));
          }
          this.grant(name, entry); // queued waiters stay queued; stealer jumps in
        });
      } else {
        queueMicrotask(() => {
          if (state.holder) state.queue.push(entry);
          else this.grant(name, entry);
        });
      }
    });
  }

  /** Clean-close release: resolve the holder (no AbortError) and grant the next. */
  releaseTab(name: string): void {
    const state = this.state(name);
    if (state.holder) this.release(name, state.holder);
  }

  // --- introspection ---

  isHeld(name: string): boolean {
    return this.state(name).holder !== null;
  }

  queueLength(name: string): number {
    return this.state(name).queue.length;
  }

  // --- internal ---

  private grant(name: string, entry: LockRequest): void {
    const state = this.state(name);
    if (state.holder) {
      throw new Error(`FakeLockManager invariant: two holders for lock "${name}"`);
    }
    state.holder = entry;
    // Native semantics: the lock is held until the callback's returned promise
    // settles. The leader callback returns a never-resolving promise (holds
    // forever until stolen); a `void` return (the closed path) releases at once.
    void Promise.resolve(entry.cb()).then(() => {
      if (state.holder === entry && !entry.settled) this.release(name, entry);
    });
  }

  private release(name: string, entry: LockRequest): void {
    const state = this.state(name);
    if (state.holder !== entry || entry.settled) return;
    entry.settled = true;
    state.holder = null;
    entry.resolve();
    const next = state.queue.shift();
    if (next) this.grant(name, next);
  }

  private state(name: string): LockState {
    let s = this.states.get(name);
    if (!s) {
      s = { holder: null, queue: [] };
      this.states.set(name, s);
    }
    return s;
  }
}

// --- Transport hub ----------------------------------------------------------

/**
 * A per-"tab" handle: the `SharedWebSocketHooks` to construct one tab's transport
 * on the shared server/bus/locks, plus the sockets/channels it created (tracked
 * so `kill`/`freeze` can act on exactly this tab's resources).
 */
export interface TabHandle {
  hooks: SharedWebSocketHooks;
  sockets: FakeWebSocket[];
  channels: FakeBroadcastChannel[];
}

export interface TransportHub {
  server: FakeWsServer;
  bus: FakeBroadcastChannelBus;
  locks: FakeLockManager;
  heartbeatMs: number;
  timeoutMs: number;
  /** A fresh tab's hooks on the shared transport (test-scaled election timers). */
  tab(): TabHandle;
  /** A `NotificationsClient` `makeSocket` hook building real sockets on this tab. */
  makeSocket(tab: TabHandle): (url: string) => SharedWebSocket;
  /** Clean tab close: server-close its sockets, release its locks, close its channels. */
  kill(tab: TabHandle): void;
  /** Freeze a tab: silence its channels (steal-required handover); locks stay held. */
  freeze(tab: TabHandle): void;
}

/**
 * Compose one server + bus + locks into a multi-tab transport. Every tab shares
 * them; each tab's channels/sockets are tracked on its handle so `kill` and
 * `freeze` target exactly one tab. The election's lock name equals its
 * BroadcastChannel name (both `singularity:shared-ws:<url>`), so `kill` derives
 * the lock names from the tab's channels.
 */
export function createTransportHub(): TransportHub {
  const server = new FakeWsServer();
  const bus = new FakeBroadcastChannelBus();
  const locks = new FakeLockManager();

  const hub: TransportHub = {
    server,
    bus,
    locks,
    heartbeatMs: HUB_HEARTBEAT_MS,
    timeoutMs: HUB_TIMEOUT_MS,
    tab(): TabHandle {
      const handle: TabHandle = { hooks: {}, sockets: [], channels: [] };
      handle.hooks = {
        makeWebSocket: (url) => {
          const ws = server.connect(url);
          handle.sockets.push(ws);
          return ws;
        },
        makeBroadcastChannel: (name) => {
          const ch = bus.channel(name);
          handle.channels.push(ch);
          return ch;
        },
        locks,
        heartbeatMs: HUB_HEARTBEAT_MS,
        timeoutMs: HUB_TIMEOUT_MS,
      };
      return handle;
    },
    makeSocket(tab: TabHandle) {
      return (url: string) => new SharedWebSocket(url, tab.hooks);
    },
    kill(tab: TabHandle): void {
      // A killed tab's JS context is gone: its sockets vanish WITHOUT firing the
      // dead tab's onclose (a `close()`, not a `serverClose()` — otherwise the
      // dead SharedWebSocket would run its reconnect handler, which a real dead
      // tab never does), and the OS releases its locks (grants the next waiter).
      for (const ws of tab.sockets) ws.close();
      for (const ch of tab.channels) {
        locks.releaseTab(ch.name);
        ch.close();
      }
    },
    freeze(tab: TabHandle): void {
      for (const ch of tab.channels) bus.freeze(ch);
    },
  };
  return hub;
}
