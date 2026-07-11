/**
 * SharedWebSocket hazard tests — the socket-owning half of the client transport
 * stack, driven on a full `createTransportHub()` (fake server + BroadcastChannel
 * bus + lock manager). The REAL SharedWebSocket runs: election, queue-until-open,
 * reconnect backoff, cross-tab relay, and the demote handler are all exercised;
 * only the three OS globals are faked.
 *
 * Pins, cross-referencing the v3 mental-model doc §9 and
 * `research/2026-07-03-global-live-state-client-transport-harness.md`:
 *   - queue-until-open + rx dispatch (the basic leader socket contract);
 *   - reconnect backoff index (500 → advance → 1000; reset on open) — the herd
 *     de-sync mechanic, with Math.random pinned so delay == base exactly;
 *   - a makeWebSocket SyntaxError schedules a reconnect instead of crashing;
 *   - follower-joined → the leader rebroadcasts `open` (pins the
 *     `WebSocket.OPEN` → `SharedWebSocket.OPEN` global-read swap);
 *   - H6-socket: killing the leader tab elects a follower with exactly one live
 *     server socket throughout;
 *   - H6c: a demoted leader closes its socket (the §4 structural fix — without
 *     `onDemoted` the stolen-from tab would keep a second live socket).
 *
 * Conventions: fake timers per test; advance only via the async variants;
 * Math.random pinned to 0.5 (delay = base·(0.5+0.5) = base); every constructed
 * SharedWebSocket is closed in afterEach (module-level buses are shared).
 */

import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { SharedWebSocket, type SharedWebSocketHooks } from "../shared-websocket";
import {
  createTransportHub,
  FakeWsServer,
  FakeBroadcastChannelBus,
  FakeLockManager,
} from "../test-support";

const URL_PATH = "/ws/test";
const CLOSED = 3;

const flush = async (): Promise<void> => {
  await vi.advanceTimersByTimeAsync(0);
};

describe("SharedWebSocket", () => {
  const built: SharedWebSocket[] = [];
  const track = (s: SharedWebSocket): SharedWebSocket => {
    built.push(s);
    return s;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    // Pin backoff jitter: delay = base · (0.5 + 0.5) = base exactly.
    vi.spyOn(Math, "random").mockReturnValue(0.5);
  });

  afterEach(() => {
    for (const s of built.splice(0)) s.close();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  test("queue-until-open flushes queued frames in order on open()", async () => {
    const hub = createTransportHub();
    const tab = hub.tab();
    const sws = track(new SharedWebSocket(URL_PATH, tab.hooks));
    await flush(); // elected → startLeading → socket created (still connecting)

    const ws = hub.server.all()[0]!;
    sws.send("a");
    sws.send("b");
    sws.send("c");
    expect(ws.sent).toEqual([]); // connecting → queued, nothing on the wire

    ws.open();
    expect(ws.sent).toEqual(["a", "b", "c"]); // flushed in order
    expect(sws.status).toBe("open");
  });

  test("an incoming server frame is dispatched to onmessage", async () => {
    const hub = createTransportHub();
    const tab = hub.tab();
    const sws = track(new SharedWebSocket(URL_PATH, tab.hooks));
    await flush();
    const ws = hub.server.all()[0]!;
    ws.open();

    const got: string[] = [];
    sws.onmessage = (ev) => got.push(ev.data);
    ws.serverSend("frame-1");
    expect(got).toEqual(["frame-1"]);
  });

  test("reconnect backoff: 500 → new socket, index advances to 1000, resets on open", async () => {
    const hub = createTransportHub();
    const tab = hub.tab();
    const sws = track(new SharedWebSocket(URL_PATH, tab.hooks));
    await flush();
    const ws1 = hub.server.all()[0]!;
    ws1.open();
    expect(sws.status).toBe("open");

    // First drop → backoff index 0 = 500ms. Nothing before 500; a new socket at 500.
    ws1.serverClose();
    expect(sws.status).toBe("reconnecting");
    await vi.advanceTimersByTimeAsync(499);
    expect(hub.server.all()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(hub.server.all()).toHaveLength(2);

    // ws2 drops WITHOUT opening → the backoff index advanced to 1 = 1000ms.
    const ws2 = hub.server.all()[1]!;
    ws2.serverClose();
    await vi.advanceTimersByTimeAsync(999);
    expect(hub.server.all()).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(hub.server.all()).toHaveLength(3);

    // ws3 opens → attempt resets; the next drop is back to the 500ms base.
    const ws3 = hub.server.all()[2]!;
    ws3.open();
    ws3.serverClose();
    await vi.advanceTimersByTimeAsync(499);
    expect(hub.server.all()).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(1);
    expect(hub.server.all()).toHaveLength(4);
  });

  test("a makeWebSocket SyntaxError schedules a reconnect instead of crashing", async () => {
    const server = new FakeWsServer();
    const bus = new FakeBroadcastChannelBus();
    const locks = new FakeLockManager();
    let throwNext = true;
    const hooks: SharedWebSocketHooks = {
      makeWebSocket: (url) => {
        if (throwNext) {
          throwNext = false;
          throw new SyntaxError("bad url");
        }
        return server.connect(url);
      },
      makeBroadcastChannel: bus.channel,
      locks,
      heartbeatMs: 40,
      timeoutMs: 120,
    };
    track(new SharedWebSocket(URL_PATH, hooks));
    await flush(); // elected → connectWs throws SyntaxError → scheduleReconnect
    expect(server.all()).toHaveLength(0); // did not crash, no socket yet

    await vi.advanceTimersByTimeAsync(500); // backoff retry succeeds
    expect(server.all()).toHaveLength(1);
  });

  test("follower-joined makes an open leader rebroadcast 'open' (pins the SharedWebSocket.OPEN swap)", async () => {
    const hub = createTransportHub();
    const tabA = hub.tab();
    const swsA = track(new SharedWebSocket(URL_PATH, tabA.hooks));
    await flush();
    hub.server.all()[0]!.open();
    expect(swsA.isLeader).toBe(true);

    const tabB = hub.tab();
    const swsB = track(new SharedWebSocket(URL_PATH, tabB.hooks));
    let bOpened = false;
    swsB.onopen = () => { bOpened = true; };
    await flush(); // B hello → A.onFollowerJoined → rebroadcast open → B learns open

    expect(swsB.isLeader).toBe(false);
    expect(swsB.status).toBe("open");
    expect(bOpened).toBe(true);
    expect(hub.server.openSockets()).toHaveLength(1); // B opened no socket of its own
  });

  test("follower-join open dedup: a third tab joining does NOT re-dispatch onopen to an already-open follower", async () => {
    // onFollowerJoined broadcasts "open" to ALL followers (BroadcastChannel has
    // no unicast). An already-OPEN follower must not re-dispatch onopen —
    // consumers treat onopen as "fresh connection, replay state"
    // (NotificationsClient replays its whole sub set), so an unconditional
    // dispatch made every existing tab re-replay on every tab join (BUG B of
    // the 2026-07-11 replay-storm forensics). A genuine reconnect still
    // dispatches: the leader's "close" broadcast resets followers to CONNECTING
    // first.
    const hub = createTransportHub();
    const tabA = hub.tab();
    const swsA = track(new SharedWebSocket(URL_PATH, tabA.hooks));
    await flush();
    const s1 = hub.server.all()[0]!;
    s1.open();
    expect(swsA.isLeader).toBe(true);

    const tabB = hub.tab();
    const swsB = track(new SharedWebSocket(URL_PATH, tabB.hooks));
    let bOpens = 0;
    swsB.onopen = () => { bOpens++; };
    await flush(); // B joins → leader rebroadcasts open → B's FIRST dispatch
    expect(bOpens).toBe(1);
    expect(swsB.status).toBe("open");

    // C joins: the rebroadcast reaches B too, but B is already OPEN → no
    // re-dispatch (no re-replay).
    const tabC = hub.tab();
    const swsC = track(new SharedWebSocket(URL_PATH, tabC.hooks));
    let cOpened = false;
    swsC.onopen = () => { cOpened = true; };
    await flush();
    expect(cOpened).toBe(true); // the joiner itself still learns "open"
    expect(bOpens).toBe(1); // the existing follower did NOT re-dispatch

    // A genuine reconnect still re-dispatches to B: close resets followers to
    // CONNECTING, so the next open is a real transition.
    s1.serverClose();
    await flush();
    expect(swsB.status).toBe("reconnecting");
    await vi.advanceTimersByTimeAsync(500); // leader backoff → new socket
    const s2 = hub.server.all().find((s) => s.readyState === 0)!;
    s2.open();
    await flush();
    expect(bOpens).toBe(2);
  });

  test("H6-socket: killing the leader tab elects the follower with exactly one live socket throughout", async () => {
    const hub = createTransportHub();
    const tabA = hub.tab();
    const swsA = track(new SharedWebSocket(URL_PATH, tabA.hooks));
    await flush();
    hub.server.all()[0]!.open();
    expect(swsA.isLeader).toBe(true);
    expect(hub.server.openSockets()).toHaveLength(1);

    const tabB = hub.tab();
    const swsB = track(new SharedWebSocket(URL_PATH, tabB.hooks));
    await flush();
    expect(swsB.isLeader).toBe(false);
    expect(hub.server.openSockets()).toHaveLength(1); // still only A's

    hub.kill(tabA); // silent socket close + lock release → B granted
    await flush();
    expect(swsB.isLeader).toBe(true);
    expect(hub.server.openSockets()).toHaveLength(0); // A's gone, B's not open yet

    const bSocket = hub.server.all().find((s) => s.readyState === 0)!;
    bSocket.open();
    expect(hub.server.openSockets()).toHaveLength(1); // exactly one
  });

  test("H6c: a demoted leader closes its socket (no two-socket violation)", async () => {
    const hub = createTransportHub();
    const tabA = hub.tab();
    const swsA = track(new SharedWebSocket(URL_PATH, tabA.hooks));
    await flush();
    const aSocket = hub.server.all()[0]!;
    aSocket.open();
    expect(swsA.isLeader).toBe(true);

    const tabB = hub.tab();
    const swsB = track(new SharedWebSocket(URL_PATH, tabB.hooks));
    await flush();
    expect(swsB.isLeader).toBe(false);

    // Freeze A (its lock stays held → B must STEAL) and let B time out.
    hub.freeze(tabA);
    await vi.advanceTimersByTimeAsync(hub.timeoutMs);

    // A demoted → onDemoted tore its socket down; it does NOT reconnect its own.
    expect(swsA.isLeader).toBe(false);
    expect(swsA.status).toBe("reconnecting");
    expect(aSocket.readyState).toBe(CLOSED);
    expect(swsB.isLeader).toBe(true);

    // B (new leader) opens exactly one socket.
    expect(hub.server.openSockets()).toHaveLength(0);
    const bSocket = hub.server.all().find((s) => s.readyState === 0)!;
    bSocket.open();
    expect(hub.server.openSockets()).toHaveLength(1);
  });
});
