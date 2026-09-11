/**
 * NotificationsClient — the server heartbeat's `flushOpenMs`. The server's ping
 * reports how long its running live-state flush pass has been open; a flush that
 * never settles freezes every push while the socket stays open and quiet, so the
 * ping is the only sign of it the tab gets. The client keeps the latest value
 * per channel in `ChannelStatuses.serverFlushOpenMs`, which the health report's
 * Connection row reads. See
 * `research/2026-09-11-global-live-updates-frozen-by-stray-fd-close.md`.
 *
 * Pins:
 *   - a ping's `flushOpenMs` lands in the channel status and notifies listeners;
 *   - a ping without it (a server that predates the field) reads as 0;
 *   - an unchanged value (an idle server's 0 → 0) notifies nobody;
 *   - a follower tab records it too (the leader broadcasts every frame);
 *   - a socket drop clears it, so a restarted server's first quiet seconds are
 *     never reported as the dead server's stall.
 *
 * Conventions follow the sibling suites: `clientLog` mocked to a no-op, fake
 * timers per test, every client `destroy()`-ed in afterEach.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@plugins/primitives/plugins/log-channels/web", () => ({
  clientLog: () => {},
}));

import { QueryClient } from "@tanstack/react-query";
import {
  createTransportHub,
  type FakeWebSocket,
} from "@plugins/primitives/plugins/networking/web";
import {
  NotificationsClient,
  type ChannelStatuses,
} from "../notifications-client";

const flush = async (): Promise<void> => {
  await vi.advanceTimersByTimeAsync(0);
};

describe("NotificationsClient — heartbeat flushOpenMs", () => {
  const clients: NotificationsClient[] = [];

  async function setup(): Promise<{
    hub: ReturnType<typeof createTransportHub>;
    client: NotificationsClient;
    socket: FakeWebSocket;
  }> {
    const hub = createTransportHub();
    const tab = hub.tab();
    const client = new NotificationsClient(new QueryClient(), {
      makeSocket: hub.makeSocket(tab),
    });
    clients.push(client);
    await flush(); // elected → worktree socket created (connecting)
    const socket = hub.server.all()[0]!;
    socket.open();
    return { hub, client, socket };
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
  });

  afterEach(() => {
    for (const c of clients.splice(0)) c.destroy();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  test("starts at 0 on both channels", async () => {
    const { client } = await setup();
    expect(client.getChannelStatuses().serverFlushOpenMs).toEqual({
      worktree: 0,
      central: 0,
    });
  });

  test("a ping's flushOpenMs lands in the channel status and notifies listeners", async () => {
    const { client, socket } = await setup();
    const seen: ChannelStatuses[] = [];
    client.subscribeChannelStatuses((s) => seen.push(s));
    seen.length = 0; // drop the synchronous initial call

    socket.serverSend({ kind: "ping", flushOpenMs: 45_000 });
    expect(client.getChannelStatuses().serverFlushOpenMs.worktree).toBe(45_000);
    expect(client.getChannelStatuses().worktree).toBe("open");
    expect(seen).toHaveLength(1);
    expect(seen[0]!.serverFlushOpenMs).toEqual({
      worktree: 45_000,
      central: 0,
    });

    socket.serverSend({ kind: "ping", flushOpenMs: 65_000 });
    expect(seen.at(-1)!.serverFlushOpenMs.worktree).toBe(65_000);
  });

  test("a ping without flushOpenMs (an older server) reads as 0", async () => {
    const { client, socket } = await setup();
    socket.serverSend({ kind: "ping", flushOpenMs: 45_000 });
    socket.serverSend({ kind: "ping" });
    expect(client.getChannelStatuses().serverFlushOpenMs.worktree).toBe(0);
  });

  test("an unchanged value notifies nobody", async () => {
    const { client, socket } = await setup();
    const listener = vi.fn();
    client.subscribeChannelStatuses(listener);
    listener.mockClear();
    socket.serverSend({ kind: "ping", flushOpenMs: 0 });
    socket.serverSend({ kind: "ping" });
    expect(listener).not.toHaveBeenCalled();
  });

  test("a follower tab records the leader's ping too", async () => {
    const hub = createTransportHub();
    const tabA = hub.tab();
    const leader = new NotificationsClient(new QueryClient(), {
      makeSocket: hub.makeSocket(tabA),
    });
    clients.push(leader);
    await flush();
    const socket = hub.server.all()[0]!;
    socket.open();
    const tabB = hub.tab();
    const follower = new NotificationsClient(new QueryClient(), {
      makeSocket: hub.makeSocket(tabB),
    });
    clients.push(follower);
    await flush(); // B is a follower, relaying through A's socket
    expect(follower.debugSnapshot().leader.worktree.isLeader).toBe(false);

    socket.serverSend({ kind: "ping", flushOpenMs: 90_000 });
    await flush(); // the leader's rx broadcast reaches the follower
    expect(leader.getChannelStatuses().serverFlushOpenMs.worktree).toBe(90_000);
    expect(follower.getChannelStatuses().serverFlushOpenMs.worktree).toBe(
      90_000,
    );
  });

  test("a socket drop clears it", async () => {
    const { client, socket } = await setup();
    socket.serverSend({ kind: "ping", flushOpenMs: 120_000 });
    expect(client.getChannelStatuses().serverFlushOpenMs.worktree).toBe(
      120_000,
    );
    socket.serverClose();
    expect(client.getChannelStatuses().worktree).not.toBe("open");
    expect(client.getChannelStatuses().serverFlushOpenMs.worktree).toBe(0);
  });
});
