import { describe, expect, test } from "bun:test";
import {
  detectDirectoryMismatches,
  detectSharedSessionIds,
  type CommissionDeps,
} from "./detect-commission";

// The live 2026-08-19 incident, as the two detectors see it. `2bf76e71` really
// ran under conv-1787096859-nhi0 (worktree att-1787096858-0t1l); it was lent to
// that conversation as a background spare by the daemon that conv-1786969506-7e03
// happens to host, and 7e03's resolver adopted it 0.5 s after nhi0 recorded it.
const XOJ5 = "/projects/-Users-epot-…-att-1786969505-xoj5";
const T0T1 = "/projects/-Users-epot-…-att-1787096858-0t1l";

const INCIDENT_CHAINS: Record<string, string[]> = {
  "conv-1786969506-7e03": ["9fd24c8e", "baf9c302", "2bf76e71"],
  "conv-1787096859-nhi0": ["6305d7ef", "2bf76e71"],
};

const INCIDENT_DIRS: Record<string, string> = {
  "9fd24c8e": XOJ5,
  baf9c302: XOJ5,
  "6305d7ef": T0T1,
  "2bf76e71": T0T1,
};

interface Fixture {
  conversations?: string[];
  chains?: Record<string, string[]>;
  /** Projects dir per session id; an id absent here has no transcript on disk. */
  dirs?: Record<string, string>;
  shared?: Array<{ claudeSessionId: string; conversationIds: string[] }>;
}

function deps(f: Fixture): CommissionDeps {
  return {
    listActiveConversations: async () =>
      (f.conversations ?? []).map((id) => ({ id })),
    listSessionChain: async (conversationId) =>
      (f.chains?.[conversationId] ?? []).map((claudeSessionId) => ({
        claudeSessionId,
      })),
    anchoredChain: async (sessionIds) => {
      type Entry = { sessionId: string; dir: string; path: string };
      let anchorDir: string | null = null;
      const kept: Entry[] = [];
      const foreign: Entry[] = [];
      for (const sessionId of sessionIds) {
        const dir = f.dirs?.[sessionId];
        if (dir === undefined) continue; // no transcript — anchors nothing
        anchorDir ??= dir;
        const entry = { sessionId, dir, path: `${dir}/${sessionId}.jsonl` };
        (dir === anchorDir ? kept : foreign).push(entry);
      }
      return { anchorDir, kept, foreign };
    },
    listSharedClaudeSessionIds: async () => f.shared ?? [],
  };
}

describe("detectDirectoryMismatches", () => {
  test("flags the conversation whose chain reaches into another worktree — and only that one", async () => {
    const found = await detectDirectoryMismatches(
      deps({
        conversations: ["conv-1786969506-7e03", "conv-1787096859-nhi0"],
        chains: INCIDENT_CHAINS,
        dirs: INCIDENT_DIRS,
      }),
    );

    // nhi0 holds the same id and is NOT flagged: for it, that transcript is in
    // its own anchor directory, which is what "it really ran it" looks like.
    expect(found).toEqual([
      {
        reason: "directory-mismatch",
        conversationId: "conv-1786969506-7e03",
        foreignSessionId: "2bf76e71",
        foreignDir: T0T1,
        anchorDir: XOJ5,
      },
    ]);
  });

  test("silent for a healthy chain, however long", async () => {
    const found = await detectDirectoryMismatches(
      deps({
        conversations: ["conv-a"],
        chains: { "conv-a": ["s1", "s2", "s3"] },
        dirs: { s1: XOJ5, s2: XOJ5, s3: XOJ5 },
      }),
    );
    expect(found).toEqual([]);
  });

  test("an entry with no transcript on disk is not a mismatch", async () => {
    // A GC'd or not-yet-written transcript says nothing about ownership — the
    // read path drops it every day for entirely innocent reasons.
    const found = await detectDirectoryMismatches(
      deps({
        conversations: ["conv-a"],
        chains: { "conv-a": ["s1", "swept", "s3"] },
        dirs: { s1: XOJ5, s3: XOJ5 },
      }),
    );
    expect(found).toEqual([]);
  });

  test("the anchor is the first entry that resolves, not the first entry", async () => {
    // s1 was swept, so s2's directory anchors the conversation and s3 is the
    // foreign one — the position in the chain decides nothing on its own.
    const found = await detectDirectoryMismatches(
      deps({
        conversations: ["conv-a"],
        chains: { "conv-a": ["s1", "s2", "s3"] },
        dirs: { s2: XOJ5, s3: T0T1 },
      }),
    );
    expect(found).toEqual([
      {
        reason: "directory-mismatch",
        conversationId: "conv-a",
        foreignSessionId: "s3",
        foreignDir: T0T1,
        anchorDir: XOJ5,
      },
    ]);
  });

  test("a one-entry chain always anchors itself", async () => {
    const found = await detectDirectoryMismatches(
      deps({
        conversations: ["conv-a"],
        chains: { "conv-a": ["s1"] },
        dirs: { s1: T0T1 },
      }),
    );
    expect(found).toEqual([]);
  });
});

describe("detectSharedSessionIds", () => {
  test("flags every holder of a session id two conversations recorded", async () => {
    const found = await detectSharedSessionIds(
      deps({
        shared: [
          {
            claudeSessionId: "2bf76e71",
            conversationIds: ["conv-1786969506-7e03", "conv-1787096859-nhi0"],
          },
        ],
      }),
    );

    // Both sides are reported. This detector reads no filesystem, so it cannot
    // tell which conversation really ran the session — naming one of them the
    // impostor would be a guess, and the repair (delete ONE chain row) needs a
    // human to say which. Two rows, each fingerprinted per (conversation, id).
    expect(found).toEqual([
      {
        reason: "shared-session-id",
        conversationId: "conv-1786969506-7e03",
        foreignSessionId: "2bf76e71",
        otherConversationIds: ["conv-1787096859-nhi0"],
      },
      {
        reason: "shared-session-id",
        conversationId: "conv-1787096859-nhi0",
        foreignSessionId: "2bf76e71",
        otherConversationIds: ["conv-1786969506-7e03"],
      },
    ]);
  });

  test("silent when no session id is shared", async () => {
    expect(await detectSharedSessionIds(deps({}))).toEqual([]);
  });

  test("a three-way share names the other two on each row", async () => {
    const found = await detectSharedSessionIds(
      deps({
        shared: [{ claudeSessionId: "s", conversationIds: ["a", "b", "c"] }],
      }),
    );
    expect(found).toHaveLength(3);
    expect(found.map((f) => f.conversationId)).toEqual(["a", "b", "c"]);
    for (const f of found) {
      expect(f.reason).toBe("shared-session-id");
      if (f.reason !== "shared-session-id") continue;
      expect(f.otherConversationIds).not.toContain(f.conversationId);
      expect(f.otherConversationIds).toHaveLength(2);
    }
  });

  // The point of this detector: it needs neither a pane, nor a process tree,
  // nor a transcript. The whole fixture above is one SQL result.
  test("works for a hibernated conversation with no pane and no transcripts", async () => {
    const found = await detectSharedSessionIds(
      deps({
        conversations: [], // nothing active at all
        shared: [{ claudeSessionId: "s", conversationIds: ["old-a", "old-b"] }],
      }),
    );
    expect(found).toHaveLength(2);
  });
});
