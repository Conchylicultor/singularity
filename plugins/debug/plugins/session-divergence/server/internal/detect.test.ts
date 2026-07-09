import { describe, expect, test } from "bun:test";
import { detectDivergences, type DetectDeps, type PaneRef } from "./detect";

const GRACE_MS = 2 * 60_000;
const T0 = Date.UTC(2026, 6, 9, 12, 0, 0);

interface Fixture {
  conversations?: string[];
  panes?: Record<string, PaneRef>;
  subtree?: Record<number, string[]>;
  chains?: Record<string, string[]>;
  mtimes?: Record<string, number>;
}

function deps(f: Fixture): DetectDeps {
  return {
    listActiveConversations: async () =>
      (f.conversations ?? []).map((id) => ({ id })),
    listPanes: async () => new Map(Object.entries(f.panes ?? {})),
    // The predicate never inspects the tree itself — it hands it straight to
    // subtreeSessionIds — so the fixture's tree can be empty.
    captureProcessTree: async () => ({ children: new Map() }),
    subtreeSessionIds: async (_tree, panePid) => f.subtree?.[panePid] ?? [],
    transcriptMtimeMs: async (sessionId) => f.mtimes?.[sessionId] ?? null,
    listSessionChain: async (conversationId) =>
      (f.chains?.[conversationId] ?? []).map((claudeSessionId) => ({
        claudeSessionId,
      })),
  };
}

const livePane: PaneRef = { panePid: 100, dead: false };

describe("detectDivergences", () => {
  test("flags a subtree session absent from the chain whose transcript leads the tail", async () => {
    const found = await detectDivergences(
      GRACE_MS,
      deps({
        conversations: ["conv-a"],
        panes: { "conv-a": livePane },
        subtree: { 100: ["stale-1", "live-2"] },
        chains: { "conv-a": ["stale-1"] },
        mtimes: { "stale-1": T0, "live-2": T0 + 12 * 3_600_000 },
      }),
    );
    expect(found).toEqual([
      {
        conversationId: "conv-a",
        chainTailSessionId: "stale-1",
        liveSubtreeSessionId: "live-2",
        tailMtimeMs: T0,
        liveMtimeMs: T0 + 12 * 3_600_000,
      },
    ]);
  });

  test("silent when every subtree session is already in the chain", async () => {
    const found = await detectDivergences(
      GRACE_MS,
      deps({
        conversations: ["conv-a"],
        panes: { "conv-a": livePane },
        subtree: { 100: ["s1", "s2"] },
        chains: { "conv-a": ["s1", "s2"] },
        mtimes: { s1: T0, s2: T0 + 3_600_000 },
      }),
    );
    expect(found).toEqual([]);
  });

  test("silent inside the grace window — a fresh fork the poller has not yet recorded", async () => {
    const found = await detectDivergences(
      GRACE_MS,
      deps({
        conversations: ["conv-a"],
        panes: { "conv-a": livePane },
        subtree: { 100: ["s1", "forked"] },
        chains: { "conv-a": ["s1"] },
        mtimes: { s1: T0, forked: T0 + 30_000 },
      }),
    );
    expect(found).toEqual([]);
  });

  test("silent for a launcher tombstone with no transcript on disk", async () => {
    const found = await detectDivergences(
      GRACE_MS,
      deps({
        conversations: ["conv-a"],
        panes: { "conv-a": livePane },
        subtree: { 100: ["s1", "tombstone"] },
        chains: { "conv-a": ["s1"] },
        mtimes: { s1: T0 }, // tombstone has no transcript
      }),
    );
    expect(found).toEqual([]);
  });

  test("silent for an old sibling session whose transcript trails the tail", async () => {
    const found = await detectDivergences(
      GRACE_MS,
      deps({
        conversations: ["conv-a"],
        panes: { "conv-a": livePane },
        subtree: { 100: ["s1", "ancient"] },
        chains: { "conv-a": ["s1"] },
        mtimes: { s1: T0, ancient: T0 - 86_400_000 },
      }),
    );
    expect(found).toEqual([]);
  });

  test("silent when the chain is empty or the tail has no transcript yet", async () => {
    const noChain = await detectDivergences(
      GRACE_MS,
      deps({
        conversations: ["conv-a"],
        panes: { "conv-a": livePane },
        subtree: { 100: ["live-2"] },
        mtimes: { "live-2": T0 },
      }),
    );
    expect(noChain).toEqual([]);

    const noTailTranscript = await detectDivergences(
      GRACE_MS,
      deps({
        conversations: ["conv-a"],
        panes: { "conv-a": livePane },
        subtree: { 100: ["live-2"] },
        chains: { "conv-a": ["pending"] },
        mtimes: { "live-2": T0 },
      }),
    );
    expect(noTailTranscript).toEqual([]);
  });

  test("skips conversations without a live pane", async () => {
    const found = await detectDivergences(
      GRACE_MS,
      deps({
        conversations: ["conv-a", "conv-b"],
        panes: { "conv-a": { panePid: 100, dead: true } },
        subtree: { 100: ["live-2"] },
        chains: { "conv-a": ["s1"], "conv-b": ["s1"] },
        mtimes: { s1: T0, "live-2": T0 + 3_600_000 },
      }),
    );
    expect(found).toEqual([]);
  });

  test("reports the freshest qualifying session, one per conversation", async () => {
    const found = await detectDivergences(
      GRACE_MS,
      deps({
        conversations: ["conv-a"],
        panes: { "conv-a": livePane },
        subtree: { 100: ["s1", "mid", "newest"] },
        chains: { "conv-a": ["s1"] },
        mtimes: {
          s1: T0,
          mid: T0 + 3_600_000,
          newest: T0 + 7_200_000,
        },
      }),
    );
    expect(found).toHaveLength(1);
    expect(found[0]!.liveSubtreeSessionId).toBe("newest");
  });
});
