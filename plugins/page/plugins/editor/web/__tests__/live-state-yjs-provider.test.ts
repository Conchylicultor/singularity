/**
 * Provider-contract tests for `LiveStateYjsProvider` (per-block CRDT plan).
 * Run with `bun run test:dom plugins/page/plugins/editor`.
 *
 * These pin the four hardening invariants at the seam where they live:
 *
 *  1. REOPEN / pre-seed discriminator — `connect()` may legally run BEFORE any
 *     of the owning hook's parent effects (`markBlockRowConfirmed`,
 *     `onServerState`): child effects fire before parent effects, and nothing
 *     in `CollaborationPlugin`'s contract orders its connect after them (today
 *     it happens to defer connect by two internal commits — an accident of its
 *     implementation, not a guarantee). The provider must therefore carry a
 *     RENDER-ACCURATE `blockRowConfirmed` from construction: an existing block
 *     (row confirmed at first render) must NEVER pre-seed on connect — its
 *     data.text-derived seed would be an independent CRDT encoding of the
 *     stored doc's content and merge as DUPLICATED text — while a client-
 *     minted block (row unconfirmed) must still pre-seed instantly (Stage 4a).
 *
 *  3. A doc-update 409 must not wedge the provider: it re-arms the init path
 *     and lets doc-init arbitrate — 404 (block really deleted) is a quiet
 *     terminal stop; success (block alive, doc row unexpectedly gone) recovers
 *     loudly by re-seeding from the FULL local doc state and resuming flushes.
 *
 *  4. Teardown must not lose buffered edits: with updates still queued the
 *     provider reports NOT ready-for-teardown, and the (single-slot) teardown
 *     listener fires push-based once a reconnect drains the queue — even
 *     though the editor already disconnected.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
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
}));

import { EndpointError, fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { LiveStateYjsProvider } from "../internal/live-state-yjs-provider";

const fetchEndpointMock = vi.mocked(fetchEndpoint);

/** Deterministic full-state encoding: one XmlText "root" holding `text`. */
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

function docText(doc: Y.Doc): string {
  return doc.get("root", Y.XmlText).toString();
}

/** Count non-overlapping occurrences of `needle` in `hay`. */
function count(hay: string, needle: string): number {
  let n = 0;
  for (let i = hay.indexOf(needle); i >= 0; i = hay.indexOf(needle, i + needle.length)) n++;
  return n;
}

/** Simulate a local (binding-origin) edit: append `text` to the content root. */
function localEdit(doc: Y.Doc, text: string): void {
  doc.transact(() => {
    const root = doc.get("root", Y.XmlText);
    root.insert(root.length, text);
  }, "binding");
}

function flushMicrotasks(): Promise<void> {
  return Promise.resolve().then(() => Promise.resolve()).then(() => {});
}

/** Advance the flush debounce and let the resulting async flush settle. */
async function runFlush(): Promise<void> {
  await vi.advanceTimersByTimeAsync(400);
  await flushMicrotasks();
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

describe("finding #1 — reopen of an existing block must not pre-seed", () => {
  test("connect() BEFORE the latch/serverState never seeds a row-confirmed block", async () => {
    const doc = new Y.Doc();
    const buildSeedState = vi.fn(() => encodedState(111, "hello world"));
    // Existing block: row confirmed at the editor's FIRST render (it only
    // renders because it is in the authoritative rows) — threaded into the
    // provider at construction, NOT via the later parent effect.
    const provider = new LiveStateYjsProvider(doc, "blk-existing", buildSeedState, true);

    // The legal worst-case order: connect fires before markBlockRowConfirmed
    // and before the subscription delivers.
    provider.connect();
    expect(buildSeedState).not.toHaveBeenCalled();
    expect(docText(doc)).toBe(""); // no pre-seed — waits for server truth

    // The stored doc arrives: the SAME visible text under a different
    // clientID (original seed + live edits). Must be the ONLY copy.
    provider.onServerState(toBase64(encodedState(222, "hello world")));
    expect(count(docText(doc), "hello world")).toBe(1);

    // Later latch (the parent effect) stays a no-op for seeding.
    provider.markBlockRowConfirmed();
    await flushMicrotasks();
    expect(buildSeedState).not.toHaveBeenCalled();
    expect(count(docText(doc), "hello world")).toBe(1);
    provider.destroy();
  });

  test("Stage 4a preserved: an unconfirmed (client-minted) block pre-seeds instantly at connect", () => {
    const doc = new Y.Doc();
    const buildSeedState = vi.fn(() => encodedState(111, "split tail"));
    const provider = new LiveStateYjsProvider(doc, "blk-fresh", buildSeedState, false);

    provider.connect();
    // Instant local hydration — the editor shows the tail immediately.
    expect(docText(doc)).toBe("split tail");

    // The eventual authoritative state (its own doc-init echo / a racing
    // tab's byte-identical deterministic seed) merges as a no-op.
    provider.onServerState(toBase64(encodedState(111, "split tail")));
    expect(count(docText(doc), "split tail")).toBe(1);
    provider.destroy();
  });
});

describe("finding #3 — a doc-update 409 must not wedge the provider", () => {
  async function syncedProvider(blockId: string): Promise<{ doc: Y.Doc; provider: LiveStateYjsProvider }> {
    const doc = new Y.Doc();
    const provider = new LiveStateYjsProvider(doc, blockId, () => encodedState(111, "seed"), true);
    provider.connect();
    provider.onServerState(toBase64(encodedState(222, "stored")));
    await flushMicrotasks();
    return { doc, provider };
  }

  test("unexpected 409 with the block alive: re-inits from the LOCAL doc and resumes flushing", async () => {
    const { doc, provider } = await syncedProvider("blk-live");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    localEdit(doc, " typed");
    // First flush 409s (doc row gone); the doc-init probe then SUCCEEDS
    // (block alive) — echoing back whatever state was posted.
    fetchEndpointMock
      .mockRejectedValueOnce(new EndpointError(409, null))
      .mockImplementationOnce(async (_endpoint, _params, opts) => {
        const body = (opts as unknown as { body: Blob }).body;
        const buf = await body.arrayBuffer();
        return { state: toBase64(new Uint8Array(buf)) };
      })
      .mockResolvedValue(undefined);

    await runFlush();
    await flushMicrotasks();

    // POST #1: the failed doc-update. POST #2: the doc-init probe, seeded
    // from the FULL local doc state (never the stale data.text seed — that
    // would re-encode content the doc already holds and duplicate).
    expect(fetchEndpointMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    const initBody = fetchEndpointMock.mock.calls[1]![2] as { body: Blob };
    const initBytes = new Uint8Array(await initBody.body.arrayBuffer());
    const replay = new Y.Doc();
    Y.applyUpdate(replay, initBytes);
    expect(docText(replay)).toContain("stored typed");
    // Loud: this interleave is unexpected (only block deletion cascades the row).
    expect(errorSpy).toHaveBeenCalled();

    // The queue drains (full-state safety update + the requeued batch) and
    // the loop is live again: a NEW edit flushes — not wedged.
    await runFlush();
    const callsBefore = fetchEndpointMock.mock.calls.length;
    localEdit(doc, " more");
    await runFlush();
    expect(fetchEndpointMock.mock.calls.length).toBeGreaterThan(callsBefore);
    expect(provider.readyForTeardown).toBe(true);
    provider.destroy();
  });

  test("409 with the block really deleted (doc-init 404): quiet terminal stop, ready for teardown", async () => {
    const { doc, provider } = await syncedProvider("blk-deleted");
    localEdit(doc, " typed");
    fetchEndpointMock
      .mockRejectedValueOnce(new EndpointError(409, null))
      .mockRejectedValueOnce(new EndpointError(404, null));

    await runFlush();
    await flushMicrotasks();

    // Server-confirmed absence: pending bytes are deliberately dropped (the
    // content moved with the merge / went with the delete) and the provider
    // is finalizable — never a buffering-forever wedge, never a loud throw.
    expect(provider.readyForTeardown).toBe(true);
    provider.destroy();
  });
});

describe("finding #4 — teardown must not lose buffered edits over a transient outage", () => {
  test("disconnect with a failed flush retains the bytes; reconnect drains and signals teardown-ready", async () => {
    const doc = new Y.Doc();
    const provider = new LiveStateYjsProvider(doc, "blk-teardown", () => encodedState(111, "seed"), true);
    provider.connect();
    provider.onServerState(toBase64(encodedState(222, "stored")));
    await flushMicrotasks();

    // Type, then unmount during a transient outage: the eager teardown flush
    // rejects at the network level.
    localEdit(doc, " last words");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    fetchEndpointMock.mockRejectedValueOnce(new TypeError("network down"));
    provider.disconnect();
    await flushMicrotasks();
    expect(warnSpy).toHaveBeenCalled(); // offline buffering surfaced once

    // The bytes are re-queued and unreachable by any editor — the registry
    // must NOT destroy yet.
    expect(provider.readyForTeardown).toBe(false);
    const onReady = vi.fn();
    provider.setTeardownReadyListener(onReady);

    // The tab reconnects (live-state socket reopens). Even though the editor
    // is disconnected, the retained provider drains its queue…
    fetchEndpointMock.mockResolvedValue(undefined);
    for (const cb of [...wsStatusListeners]) cb({ status: "open", url: "ws://x/worktree" });
    await flushMicrotasks();

    // …and signals the registry push-based that destroying is now safe.
    expect(onReady).toHaveBeenCalled();
    expect(provider.readyForTeardown).toBe(true);
    const flushed = fetchEndpointMock.mock.calls.at(-1)![2] as { body: Blob };
    const bytes = new Uint8Array(await flushed.body.arrayBuffer());
    const replay = new Y.Doc();
    Y.applyUpdate(replay, toBytesSafe(encodedState(222, "stored")));
    Y.applyUpdate(replay, bytes);
    expect(docText(replay)).toContain("last words");
    provider.destroy();
  });
});

/** Identity helper (keeps the replay call sites uniform). */
function toBytesSafe(bytes: Uint8Array): Uint8Array {
  return bytes;
}
