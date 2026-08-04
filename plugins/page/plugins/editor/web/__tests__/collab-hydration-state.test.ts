/**
 * The block-content session's HYDRATION STATE (stage 4 of
 * `research/2026-08-03-page-block-content-session-one-owner.md`).
 *
 * One property, four states, and each test below is a defect the machine
 * exists to close:
 *
 *  1. **A client-minted block never waits.** `maybeInit()` returns immediately
 *     while the row is unconfirmed, so anything that made a freshly-split block
 *     wait on the server here would cost it a full round trip and destroy the
 *     instant-split path. The locally-authoritative arm reaches `hydrated`
 *     inside one synchronous `connect()`, with no network at all.
 *  2. **An answer carrying nothing renderable is TRIVIALLY hydrated.** Yjs
 *     emits no event for an apply that integrates nothing, so `@lexical/yjs`
 *     never runs `syncYjsChangesToLexical` and NO commit is ever scheduled —
 *     waiting for one would strand every genuinely-empty block in `hydrating`
 *     forever, with its write path gated.
 *  3. **A verification mismatch is `stalled`, never a silent pass.** And the
 *     late (`promoteOnly`) probe may confirm agreement but must never conclude
 *     disagreement — a merely-pending commit looks exactly like a blind one.
 *  4. **`hydrating` gates the WRITE path**: the `data.text` projection does not
 *     persist and the transport does not flush. It does NOT gate the editing
 *     host (that would deadlock the caret authority), and the gate opens the
 *     moment teardown is decided, so an unmount always flushes.
 *
 * Run with `bun run test:dom plugins/page/plugins/editor`.
 */

import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import * as Y from "yjs";

vi.mock("@plugins/infra/plugins/endpoints/web", async (importOriginal) => {
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

const resourceValue: { pending: boolean; data: { state: string }[] } = {
  pending: true,
  data: [],
};
vi.mock("@plugins/primitives/plugins/live-state/web", () => ({
  liveStateSocketKind: () => "worktree",
  useResource: () => resourceValue,
}));

import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { runsToXmlText, xmlTextContentLength, type RichText } from "../../core";
import type { BindingReplica } from "../internal/binding-replica";
import { CollabSession } from "../internal/collab-session";
import type { DocSourcedRuns, ProjectTextFn } from "../internal/doc-sourced-runs";
import { useCollabBlockDoc } from "../internal/use-collab-block-doc";

const fetchEndpointMock = vi.mocked(fetchEndpoint);

/** A block's content doc as the wire carries it, built the way the app builds it. */
function docStateFor(runs: RichText): Uint8Array {
  const xml = runsToXmlText(runs);
  const doc = xml.doc;
  if (!doc) throw new Error("docStateFor: seed XmlText is not attached to a doc");
  return Y.encodeStateAsUpdate(doc);
}

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** The state an EMPTY block's doc row holds: a doc that renders nothing. */
const EMPTY_DOC_STATE = toBase64(Y.encodeStateAsUpdate(new Y.Doc()));

const buildSeedState = (): Uint8Array => docStateFor([{ text: "seed" }]);

let nextId = 0;
const blockId = (): string => `blk-hydration-${(nextId += 1)}`;

beforeEach(() => {
  vi.useFakeTimers();
  fetchEndpointMock.mockReset();
  fetchEndpointMock.mockResolvedValue({ state: EMPTY_DOC_STATE });
  resourceValue.pending = true;
  resourceValue.data = [];
});

afterEach(() => {
  vi.useRealTimers();
  wsStatusListeners.length = 0;
  vi.restoreAllMocks();
});

// --- 1. The client-minted arm ------------------------------------------------

test("a client-minted block reaches hydrated synchronously inside connect(), with no network", () => {
  const id = blockId();
  // `rowConfirmed: false` — a freshly split/inserted block, rendering from the
  // optimistic overlay before its `_blocks` row exists server-side.
  const session = CollabSession.start(id, buildSeedState, false, true);
  expect(session.locallyAuthoritative).toBe(true);
  expect(session.state.kind).toBe("attaching");

  const replica = session.replicaForBinding();
  replica.connect();

  // Synchronously hydrated: this client IS the authority, so there is no remote
  // answer that could be missing and nothing to wait for.
  expect(session.state.kind).toBe("hydrated");
  expect(session.writeAllowed).toBe(true);
  expect(fetchEndpointMock).not.toHaveBeenCalled();

  // …and the later confirmation is a RE-ASSERT: it must not walk the state
  // back, reset anything, or re-close the gate.
  session.owner.provider.markBlockRowConfirmed();
  expect(session.state.kind).toBe("hydrated");
  expect(session.writeAllowed).toBe(true);

  session.end();
  vi.advanceTimersByTime(1);
});

test("the in-memory transport is locally authoritative for its whole life", () => {
  const id = blockId();
  const session = CollabSession.start(id, buildSeedState, true, false);
  expect(session.locallyAuthoritative).toBe(true);
  session.replicaForBinding().connect();
  expect(session.state.kind).toBe("hydrated");
  // A restart keeps the arm: with no server there is nothing to be behind, so
  // `stalled` stays structurally unreachable here.
  const successor = session.restart();
  expect(successor.locallyAuthoritative).toBe(true);
  vi.advanceTimersByTime(1);
  successor.end();
  vi.advanceTimersByTime(1);
});

// --- 2. An answer with nothing renderable ------------------------------------

test("an empty catch-up is trivially hydrated rather than waiting for a commit that never comes", () => {
  const id = blockId();
  const session = CollabSession.start(id, buildSeedState, true, true);
  const replica = session.replicaForBinding();

  // Nothing delivered yet: the server's answer is still coming.
  replica.connect();
  expect(session.state.kind).toBe("hydrating");
  expect(session.writeAllowed).toBe(false);

  // The answer arrives and carries nothing the binding could render. Applying
  // it integrates NO content, so Yjs emits no update, `@lexical/yjs` never runs
  // and no commit is ever scheduled — this must resolve on the transport's own
  // sync announcement instead.
  session.owner.provider.onServerState(EMPTY_DOC_STATE);
  expect(session.state.kind).toBe("hydrated");
  expect(session.writeAllowed).toBe(true);

  session.end();
  vi.advanceTimersByTime(1);
});

test("an answer that DOES carry content stays hydrating until a commit proves it", () => {
  const id = blockId();
  const session = CollabSession.start(id, buildSeedState, true, true);
  const replica = session.replicaForBinding();
  replica.connect();

  session.owner.provider.onServerState(toBase64(docStateFor([{ text: "hello" }])));
  // Synced, but the replica now holds something: the binding has to prove it
  // rendered it, and the proof is the commit — not the sync.
  expect(session.state.kind).toBe("hydrating");

  const docLength = xmlTextContentLength(
    replica.replicaDoc.get("root", Y.XmlText) as Y.XmlText,
  );
  session.verifyRendered(docLength);
  expect(session.state.kind).toBe("hydrated");

  session.end();
  vi.advanceTimersByTime(1);
});

// --- 3. Verification ---------------------------------------------------------

test("a verification mismatch yields stalled, and a late probe may not conclude one", () => {
  const id = blockId();
  const session = CollabSession.start(id, buildSeedState, true, true);
  const replica = session.replicaForBinding();
  session.owner.provider.onServerState(toBase64(docStateFor([{ text: "hello" }])));
  replica.connect();
  expect(session.state.kind).toBe("hydrating");

  // The mount-time probe runs before the collab commit has landed, so "the
  // editor renders nothing" is the NORMAL state there. It may confirm, never
  // conclude.
  session.verifyRendered(0, true);
  expect(session.state.kind).toBe("hydrating");

  // The real commit: the binding rendered nothing of what its replica holds.
  session.verifyRendered(0);
  expect(session.state).toMatchObject({
    kind: "stalled",
    reason: "binding-behind-replica",
    shownLength: 0,
  });
  const stalled = session.state;
  if (stalled.kind !== "stalled") throw new Error("unreachable");
  expect(stalled.docLength).toBeGreaterThan(0);
  // A failure must not hold the user's bytes hostage — it gets a Retry instead.
  expect(session.writeAllowed).toBe(true);

  session.end();
  vi.advanceTimersByTime(1);
});

// --- 4. The write gate -------------------------------------------------------

test("hydrating holds the transport flush, and ending it releases the bytes", async () => {
  const id = blockId();
  const session = CollabSession.start(id, buildSeedState, true, true);
  const replica = session.replicaForBinding();
  replica.connect();
  // Sync WITH content, so the session stays hydrating (no commit can arrive:
  // there is no real Lexical binding here).
  session.owner.provider.onServerState(toBase64(docStateFor([{ text: "hello" }])));
  expect(session.state.kind).toBe("hydrating");

  // A local edit while the gate is closed: queued, never posted.
  fetchEndpointMock.mockClear();
  replica.replicaDoc.transact(() => {
    const root = replica.replicaDoc.get("root", Y.XmlText);
    root.insert(root.length, "!");
  }, "binding");
  await vi.advanceTimersByTimeAsync(500);
  expect(fetchEndpointMock).not.toHaveBeenCalled();
  // …but the cloud still says the bytes are owed.
  expect(session.owner.provider.getSaveState().phase).toBe("syncing");

  // Teardown opens the gate the moment it is DECIDED, so the eager disconnect
  // flush is never swallowed.
  session.end();
  await vi.advanceTimersByTimeAsync(5);
  expect(fetchEndpointMock).toHaveBeenCalled();
});

test("hydrating suppresses the data.text projection, and opening the gate replays it", async () => {
  const id = blockId();
  const projectText = vi.fn();
  const { result, unmount } = renderHook(() =>
    useCollabBlockDoc(id, [], true, projectText as unknown as ProjectTextFn),
  );

  // Mount the binding the way `CollaborationPlugin` does.
  let replica!: BindingReplica;
  act(() => {
    replica = result.current.providerFactory(id, new Map()) as BindingReplica;
    replica.connect();
  });
  expect(result.current.hydration.kind).toBe("hydrating");

  // Content lands in this block's doc (another binding, offscreen surgery, a
  // server push) — the projection arms and its window expires while the gate is
  // still closed.
  act(() => {
    Y.applyUpdate(replica.replicaDoc, docStateFor([{ text: "hello" }]), "binding");
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1500);
  });
  expect(projectText).not.toHaveBeenCalled();

  // Proving the binding renders what its replica holds opens the gate, and the
  // dropped window is replayed push-based — not on the next keystroke.
  const shown = xmlTextContentLength(replica.replicaDoc.get("root", Y.XmlText) as Y.XmlText);
  act(() => {
    result.current.verifyRendered(shown);
  });
  expect(result.current.hydration.kind).toBe("hydrated");
  expect(projectText).toHaveBeenCalledTimes(1);
  expect(projectText.mock.calls[0]?.[1] as DocSourcedRuns).toEqual([{ text: "hello" }]);

  unmount();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5);
  });
});
