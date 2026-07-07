/**
 * Registry-lifecycle test for the per-block collab-doc registry
 * (`use-collab-block-doc.ts`): the deferred destroy must RETAIN an entry
 * whose provider still holds buffered (unflushed) local edits — an ordinary
 * unmount coinciding with a transient outage — and only truly destroy it once
 * a reconnect drains the queue (push-based via the provider's teardown-ready
 * signal). Run with `bun run test:dom plugins/page/plugins/editor`.
 */

import { afterEach, beforeEach, expect, test, vi } from "vitest";
import * as Y from "yjs";

vi.mock("@plugins/infra/plugins/endpoints/web", async (importOriginal) => {
  // Keep the REAL EndpointError (the provider does instanceof checks on it);
  // only the network call is stubbed.
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, fetchEndpoint: vi.fn() };
});

const wsStatusListeners: Array<(ev: { status: string; url: string }) => void> = [];
vi.mock("@plugins/primitives/plugins/networking/web", () => ({
  subscribeWsStatus: (cb: (ev: { status: string; url: string }) => void) => {
    wsStatusListeners.push(cb);
    return () => {
      const i = wsStatusListeners.indexOf(cb);
      if (i >= 0) wsStatusListeners.splice(i, 1);
    };
  },
}));

vi.mock("@plugins/primitives/plugins/live-state/web", () => ({
  liveStateSocketKind: () => "worktree",
  useResource: vi.fn(() => ({ pending: true, data: [] })),
}));

import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { acquireCollabDoc, releaseCollabDoc } from "../internal/use-collab-block-doc";

const fetchEndpointMock = vi.mocked(fetchEndpoint);

function encodedState(clientID: number, text: string): Uint8Array {
  const d = new Y.Doc();
  d.clientID = clientID;
  d.get("root", Y.XmlText).insert(0, text);
  return Y.encodeStateAsUpdate(d);
}

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function flushMicrotasks(): Promise<void> {
  return Promise.resolve().then(() => Promise.resolve()).then(() => {});
}

beforeEach(() => {
  vi.useFakeTimers();
  fetchEndpointMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  wsStatusListeners.length = 0;
  vi.restoreAllMocks();
});

test("deferred destroy retains an entry with buffered edits and finalizes after the queue drains", async () => {
  const blockId = "blk-registry-teardown";
  const buildSeedState = () => encodedState(111, "seed");

  const entry = acquireCollabDoc(blockId, buildSeedState, true);
  entry.provider.connect();
  entry.provider.onServerState(toBase64(encodedState(222, "stored")));
  await flushMicrotasks();

  // A local edit whose flush fails at the network level (transient outage).
  fetchEndpointMock.mockRejectedValueOnce(new TypeError("network down"));
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  entry.doc.transact(() => {
    const root = entry.doc.get("root", Y.XmlText);
    root.insert(root.length, " last words");
  }, "binding");
  await vi.advanceTimersByTimeAsync(400); // flush debounce → failed POST
  await flushMicrotasks();
  expect(warnSpy).toHaveBeenCalled();

  // Ordinary unmount: release the only hold; the deferred-destroy timer runs.
  releaseCollabDoc(blockId);
  await vi.advanceTimersByTimeAsync(1);
  await flushMicrotasks();

  // RETAINED: re-acquiring returns the SAME entry (same doc — nothing was
  // destroyed while unflushed bytes remained).
  const reacquired = acquireCollabDoc(blockId, buildSeedState, true);
  expect(reacquired).toBe(entry);
  releaseCollabDoc(blockId);
  await vi.advanceTimersByTimeAsync(1);

  // The tab reconnects; the retained provider drains its queue…
  fetchEndpointMock.mockResolvedValue(undefined);
  for (const cb of [...wsStatusListeners]) cb({ status: "open", url: "ws://x/worktree" });
  await flushMicrotasks();

  // …and the registry finalizes push-based: a fresh acquire now creates a
  // NEW entry (the old one was destroyed once safe).
  const fresh = acquireCollabDoc(blockId, buildSeedState, true);
  expect(fresh).not.toBe(entry);
  releaseCollabDoc(blockId);
  await vi.advanceTimersByTimeAsync(1);
  await flushMicrotasks();
});
