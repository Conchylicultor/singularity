import { describe, expect, test } from "bun:test";
import {
  detectDivergences,
  reachableSessionIds,
  type ClaimContext,
  type DetectDeps,
  type PaneRef,
  type SessionLink,
} from "./detect";

const GRACE_MS = 2 * 60_000;
const T0 = Date.UTC(2026, 6, 9, 12, 0, 0);

/** The projects dir a session's transcript sits in when the fixture says nothing. */
const ANCHOR_DIR = "/projects/own-worktree";

interface Fixture {
  conversations?: string[];
  panes?: Record<string, PaneRef>;
  /** Reachable ids per pane pid — the shortcut most predicate tests want. */
  paneSessions?: Record<number, string[]>;
  /**
   * The raw sessions files per pane pid, for the tests that need the REAL
   * reachability rule (claim exclusion included) rather than a canned answer.
   */
  paneLinks?: Record<
    number,
    { subtree: SessionLink[]; directory?: SessionLink[] }
  >;
  chains?: Record<string, string[]>;
  mtimes?: Record<string, number>;
  /** Projects dir per session id; anything unlisted resolves to ANCHOR_DIR. */
  dirs?: Record<string, string>;
}

function deps(f: Fixture): DetectDeps {
  // A session resolves to a transcript exactly when the fixture gives it an
  // mtime or a directory — the same "is it on disk" question findTranscriptPath
  // answers in production.
  const resolves = (sessionId: string): boolean =>
    f.mtimes?.[sessionId] !== undefined || f.dirs?.[sessionId] !== undefined;

  return {
    listActiveConversations: async () =>
      (f.conversations ?? []).map((id) => ({ id })),
    listPanes: async () => new Map(Object.entries(f.panes ?? {})),
    // The predicate never inspects the tree itself — it hands it straight to
    // paneSessionIds — so the fixture's tree can be empty.
    captureProcessTree: async () => ({ children: new Map(), pids: new Set() }),
    // `knownPaneIds` is NOT re-derived here: it is whatever detectDivergences
    // computed from listPanes, so these tests exercise that wiring too.
    paneSessionIds: async (_tree, pane, knownPaneIds) => {
      const links = f.paneLinks?.[pane.panePid];
      if (links) {
        return reachableSessionIds(links.subtree, links.directory ?? [], {
          paneId: pane.paneId,
          knownPaneIds,
        });
      }
      return f.paneSessions?.[pane.panePid] ?? [];
    },
    transcriptMtimeMs: async (sessionId) => f.mtimes?.[sessionId] ?? null,
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
        if (!resolves(sessionId)) continue;
        const dir = f.dirs?.[sessionId] ?? ANCHOR_DIR;
        anchorDir ??= dir;
        const entry = { sessionId, dir, path: `${dir}/${sessionId}.jsonl` };
        (dir === anchorDir ? kept : foreign).push(entry);
      }
      return { anchorDir, kept, foreign };
    },
  };
}

const livePane: PaneRef = { panePid: 100, paneId: "%1", dead: false };

/** One `~/.claude/sessions/<pid>.json`, reduced to the fields ownership turns on. */
const link = (l: Partial<SessionLink>): SessionLink => ({
  sessionId: null,
  jobId: null,
  parkedJobId: null,
  stampedPaneId: null,
  kind: null,
  ...l,
});

describe("detectDivergences", () => {
  test("flags a pane session absent from the chain whose transcript leads the tail", async () => {
    const found = await detectDivergences(
      GRACE_MS,
      deps({
        conversations: ["conv-a"],
        panes: { "conv-a": livePane },
        paneSessions: { 100: ["stale-1", "live-2"] },
        chains: { "conv-a": ["stale-1"] },
        mtimes: { "stale-1": T0, "live-2": T0 + 12 * 3_600_000 },
      }),
    );
    expect(found).toEqual([
      {
        conversationId: "conv-a",
        chainTailSessionId: "stale-1",
        liveSessionId: "live-2",
        tailMtimeMs: T0,
        liveMtimeMs: T0 + 12 * 3_600_000,
      },
    ]);
  });

  test("silent when every pane session is already in the chain", async () => {
    const found = await detectDivergences(
      GRACE_MS,
      deps({
        conversations: ["conv-a"],
        panes: { "conv-a": livePane },
        paneSessions: { 100: ["s1", "s2"] },
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
        paneSessions: { 100: ["s1", "forked"] },
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
        paneSessions: { 100: ["s1", "tombstone"] },
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
        paneSessions: { 100: ["s1", "ancient"] },
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
        paneSessions: { 100: ["live-2"] },
        mtimes: { "live-2": T0 },
      }),
    );
    expect(noChain).toEqual([]);

    const noTailTranscript = await detectDivergences(
      GRACE_MS,
      deps({
        conversations: ["conv-a"],
        panes: { "conv-a": livePane },
        paneSessions: { 100: ["live-2"] },
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
        panes: { "conv-a": { panePid: 100, paneId: "%1", dead: true } },
        paneSessions: { 100: ["live-2"] },
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
        paneSessions: { 100: ["s1", "mid", "newest"] },
        chains: { "conv-a": ["s1"] },
        mtimes: {
          s1: T0,
          mid: T0 + 3_600_000,
          newest: T0 + 7_200_000,
        },
      }),
    );
    expect(found).toHaveLength(1);
    expect(found[0]!.liveSessionId).toBe("newest");
  });

  // The baseline is the last entry that lives in the conversation's OWN projects
  // directory, not `chain.at(-1)`. On a chain corrupted by cross-talk the tail is
  // the foreign entry, so measuring against it measures a stranger's typing
  // speed: a busy stranger hides a real divergence (below), an idle one invents
  // a fake lead.
  test("measures the lead against the last ANCHORED entry, not a foreign tail", async () => {
    const fixture: Parameters<typeof deps>[0] = {
      conversations: ["conv-a"],
      panes: { "conv-a": livePane },
      paneSessions: { 100: ["live-2"] },
      chains: { "conv-a": ["own-1", "own-2", "stranger"] },
      dirs: { stranger: "/projects/other-worktree" },
      mtimes: {
        "own-1": T0 - 3_600_000,
        "own-2": T0,
        // The stranger's agent is busy and races 10h ahead of everything here.
        stranger: T0 + 10 * 3_600_000,
        "live-2": T0 + 3_600_000,
      },
    };

    const found = await detectDivergences(GRACE_MS, deps(fixture));

    expect(found).toHaveLength(1);
    expect(found[0]!.chainTailSessionId).toBe("own-2");
    expect(found[0]!.tailMtimeMs).toBe(T0);
    expect(found[0]!.liveSessionId).toBe("live-2");
  });

  test("silent when nothing in the chain resolves — no baseline to measure against", async () => {
    const found = await detectDivergences(
      GRACE_MS,
      deps({
        conversations: ["conv-a"],
        panes: { "conv-a": livePane },
        paneSessions: { 100: ["live-2"] },
        chains: { "conv-a": ["gone-1", "gone-2"] },
        mtimes: { "live-2": T0 },
      }),
    );
    expect(found).toEqual([]);
  });

  // The ship-blocker, end to end through the real reachability rule: pane %3429
  // hosts the machine-wide Claude daemon, so a spare lent to ANOTHER
  // conversation sits in its process subtree writing a transcript hours ahead of
  // this pane's own. Once the resolver stops adopting that id it satisfies every
  // clause of the predicate — absent from the chain, has a transcript, leads the
  // tail — and would fire here every 5 minutes forever.
  test("silent for the daemon-hosting pane whose subtree holds a lent background spare", async () => {
    const found = await detectDivergences(
      GRACE_MS,
      deps({
        conversations: ["conv-7e03"],
        panes: { "conv-7e03": { panePid: 9948, paneId: "%3429", dead: false } },
        paneLinks: {
          9948: {
            subtree: [
              link({
                sessionId: "9fd24c8e",
                stampedPaneId: "%3429",
                parkedJobId: "job-baf",
              }),
              link({
                sessionId: "2bf76e71",
                kind: "bg",
                jobId: "job-nhi0",
              }),
            ],
            directory: [
              link({ sessionId: "baf9c302", jobId: "job-baf" }),
              link({ sessionId: "2bf76e71", kind: "bg", jobId: "job-nhi0" }),
            ],
          },
        },
        chains: { "conv-7e03": ["9fd24c8e", "baf9c302"] },
        mtimes: {
          "9fd24c8e": T0 - 86_400_000,
          baf9c302: T0,
          // The borrowed spare is the freshest file on the machine.
          "2bf76e71": T0 + 10 * 3_600_000,
        },
      }),
    );
    expect(found).toEqual([]);
  });

  // Same machine, same spare — but seen from the pane that actually parked it.
  // The pointer hop admits it, so a chain that had never recorded it is still
  // flagged. This is the half that must NOT be lost to the exclusions above.
  test("still flags the parked session for the pane whose own pointer reaches it", async () => {
    const found = await detectDivergences(
      GRACE_MS,
      deps({
        conversations: ["conv-nhi0"],
        panes: {
          "conv-nhi0": { panePid: 64768, paneId: "%3456", dead: false },
        },
        paneLinks: {
          64768: {
            subtree: [
              link({
                sessionId: "6305d7ef",
                stampedPaneId: "%3456",
                parkedJobId: "job-nhi0",
              }),
            ],
            directory: [
              link({ sessionId: "2bf76e71", kind: "bg", jobId: "job-nhi0" }),
            ],
          },
        },
        chains: { "conv-nhi0": ["6305d7ef"] },
        mtimes: {
          "6305d7ef": T0,
          "2bf76e71": T0 + 10 * 3_600_000,
        },
      }),
    );
    expect(found).toHaveLength(1);
    expect(found[0]!.liveSessionId).toBe("2bf76e71");
  });
});

// The reachability half: which session ids a pane can account for at all. The
// predicate above only ever sees this function's OUTPUT, so a pane whose live
// session is missing here is invisible to the monitor no matter how correct the
// predicate is — which is exactly how the 2026-08-18 parked-session outage ran
// for 10 hours unreported.
describe("reachableSessionIds", () => {
  const claim: ClaimContext = {
    paneId: "%1",
    knownPaneIds: new Set(["%1", "%2"]),
  };

  test("a plain pane accounts for the sessions its own files name", () => {
    expect(
      reachableSessionIds(
        [link({ sessionId: "a" }), link({ sessionId: "b" })],
        [],
        claim,
      ).sort(),
    ).toEqual(["a", "b"]);
  });

  test("a parked pointer reaches the host outside the subtree", () => {
    // The pane's stub still names the PRE-fork id; the live session runs under
    // a launchd-reparented host that shares only the job id with it.
    const ids = reachableSessionIds(
      [link({ sessionId: "9fd24c8e", parkedJobId: "baf9c302" })],
      [
        link({ sessionId: "unrelated", jobId: "other-job" }),
        link({ sessionId: "baf9c302-68bf", jobId: "baf9c302" }),
      ],
      claim,
    );
    expect(ids.sort()).toEqual(["9fd24c8e", "baf9c302-68bf"]);
  });

  test("pointers are followed transitively", () => {
    const ids = reachableSessionIds(
      [link({ sessionId: "stub", parkedJobId: "job-1" })],
      [
        link({ sessionId: "middle", jobId: "job-1", parkedJobId: "job-2" }),
        link({ sessionId: "last", jobId: "job-2" }),
      ],
      claim,
    );
    expect(ids.sort()).toEqual(["last", "middle", "stub"]);
  });

  test("a pointer cycle terminates", () => {
    const ids = reachableSessionIds(
      [link({ sessionId: "stub", parkedJobId: "job-a" })],
      [
        link({ sessionId: "a", jobId: "job-a", parkedJobId: "job-b" }),
        link({ sessionId: "b", jobId: "job-b", parkedJobId: "job-a" }),
      ],
      claim,
    );
    expect(ids.sort()).toEqual(["a", "b", "stub"]);
  });

  test("a pointer nothing claims contributes nothing", () => {
    expect(
      reachableSessionIds(
        [link({ sessionId: "stub", parkedJobId: "gone" })],
        [],
        claim,
      ),
    ).toEqual(["stub"]);
  });

  test("our own stamp is not a foreign claim", () => {
    expect(
      reachableSessionIds(
        [link({ sessionId: "mine", stampedPaneId: "%1" })],
        [],
        claim,
      ),
    ).toEqual(["mine"]);
  });

  test("a record stamping another LIVE pane is that pane's, not ours", () => {
    expect(
      reachableSessionIds(
        [
          link({ sessionId: "mine", stampedPaneId: "%1" }),
          link({ sessionId: "theirs", stampedPaneId: "%2" }),
        ],
        [],
        claim,
      ),
    ).toEqual(["mine"]);
  });

  // The exclusion is somebody else's CLAIM, not the resolver's ownership rule.
  // A stamp naming a pane that no longer exists claims nothing that can be
  // checked, and a session left behind by a dead pane is exactly the relocation
  // shape this monitor exists to notice — so it stays evidence.
  test("a record stamping a pane tmux no longer reports stays evidence", () => {
    expect(
      reachableSessionIds(
        [link({ sessionId: "orphan", stampedPaneId: "%999" })],
        [],
        claim,
      ),
    ).toEqual(["orphan"]);
  });

  // Everything merely UNCLAIMED stays evidence too, even though the resolver
  // would refuse it (unstamped + foreign cwd fails its locality tier). That gap
  // is the monitor: it must be able to see what the resolver declines to guess at.
  test("an unstamped, unclaimed record stays evidence", () => {
    expect(
      reachableSessionIds([link({ sessionId: "unclaimed" })], [], claim),
    ).toEqual(["unclaimed"]);
  });

  test("a background host in the subtree is not evidence — the daemon lends spares", () => {
    expect(
      reachableSessionIds(
        [
          link({ sessionId: "mine", stampedPaneId: "%1" }),
          link({ sessionId: "lent-spare", kind: "bg", jobId: "job-elsewhere" }),
        ],
        [],
        claim,
      ),
    ).toEqual(["mine"]);
  });

  test("a background host's own parked pointer is not followed either", () => {
    // The spare belongs to another conversation, so where IT parked its session
    // is that conversation's business, not this pane's.
    expect(
      reachableSessionIds(
        [link({ sessionId: "spare", kind: "bg", parkedJobId: "job-x" })],
        [link({ sessionId: "deeper", jobId: "job-x" })],
        claim,
      ),
    ).toEqual([]);
  });

  test("a background host IS evidence when our own pointer reaches it", () => {
    // Same `kind: "bg"` record, admitted this time because we pointed at it.
    const ids = reachableSessionIds(
      [
        link({
          sessionId: "stub",
          stampedPaneId: "%1",
          parkedJobId: "job-mine",
        }),
      ],
      [link({ sessionId: "parked", kind: "bg", jobId: "job-mine" })],
      claim,
    );
    expect(ids.sort()).toEqual(["parked", "stub"]);
  });
});
