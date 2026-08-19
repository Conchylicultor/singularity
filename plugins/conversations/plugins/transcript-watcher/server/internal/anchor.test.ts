import { describe, expect, test } from "bun:test";
import { CLAUDE_PROJECTS_DIR } from "@plugins/infra/plugins/paths/core";
import { resolveAnchoredChain } from "./anchor";

// The resolver is a fixed map, so nothing here touches the disk — the real
// constant is used only so the fixture cannot hardcode a path.
const PROJECTS = CLAUDE_PROJECTS_DIR;
// The two real directories from the 2026-08-19 incident.
const OWN = `${PROJECTS}/-wt--claude-worktrees-att-1786969505-xoj5`;
const OTHER = `${PROJECTS}/-wt--claude-worktrees-att-1787096858-0t1l`;

/** A resolver over a fixed sessionId → path map; unknown ids resolve to null. */
function resolverFor(map: Record<string, string>) {
  return async (sessionId: string): Promise<string | null> =>
    map[sessionId] ?? null;
}

describe("resolveAnchoredChain", () => {
  test("an empty chain anchors nothing", async () => {
    const chain = await resolveAnchoredChain([], resolverFor({}));
    expect(chain).toEqual({ anchorDir: null, kept: [], foreign: [] });
  });

  test("a single-session chain anchors on itself", async () => {
    const chain = await resolveAnchoredChain(
      ["a"],
      resolverFor({ a: `${OWN}/a.jsonl` }),
    );
    expect(chain.anchorDir).toBe(OWN);
    expect(chain.kept.map((k) => k.sessionId)).toEqual(["a"]);
    expect(chain.foreign).toEqual([]);
  });

  test("sessions in one directory are all kept, in chain order", async () => {
    const chain = await resolveAnchoredChain(
      ["a", "b", "c"],
      resolverFor({
        a: `${OWN}/a.jsonl`,
        b: `${OWN}/b.jsonl`,
        c: `${OWN}/c.jsonl`,
      }),
    );
    expect(chain.anchorDir).toBe(OWN);
    expect(chain.kept.map((k) => k.path)).toEqual([
      `${OWN}/a.jsonl`,
      `${OWN}/b.jsonl`,
      `${OWN}/c.jsonl`,
    ]);
    expect(chain.foreign).toEqual([]);
  });

  test("the live incident: the foreign tail is partitioned out, not kept", async () => {
    // conv-1786969506-7e03's real chain on 2026-08-19: two of its own sessions,
    // then conv-1787096859-nhi0's session adopted from a shared daemon spare.
    const chain = await resolveAnchoredChain(
      [
        "9fd24c8e-e09c-44d2-b282-bf857b8f59f6",
        "baf9c302-68bf-49c6-9f6b-cd58a290b209",
        "2bf76e71-986e-4818-9dde-403eca397bfc",
      ],
      resolverFor({
        "9fd24c8e-e09c-44d2-b282-bf857b8f59f6": `${OWN}/9fd24c8e-e09c-44d2-b282-bf857b8f59f6.jsonl`,
        "baf9c302-68bf-49c6-9f6b-cd58a290b209": `${OWN}/baf9c302-68bf-49c6-9f6b-cd58a290b209.jsonl`,
        "2bf76e71-986e-4818-9dde-403eca397bfc": `${OTHER}/2bf76e71-986e-4818-9dde-403eca397bfc.jsonl`,
      }),
    );

    expect(chain.anchorDir).toBe(OWN);
    expect(chain.kept.map((k) => k.sessionId)).toEqual([
      "9fd24c8e-e09c-44d2-b282-bf857b8f59f6",
      "baf9c302-68bf-49c6-9f6b-cd58a290b209",
    ]);
    expect(chain.foreign).toEqual([
      {
        sessionId: "2bf76e71-986e-4818-9dde-403eca397bfc",
        path: `${OTHER}/2bf76e71-986e-4818-9dde-403eca397bfc.jsonl`,
        dir: OTHER,
      },
    ]);
    // The tail `rewindLastUserTurn` truncates is this conversation's own file.
    expect(chain.kept.at(-1)?.path).toBe(
      `${OWN}/baf9c302-68bf-49c6-9f6b-cd58a290b209.jsonl`,
    );
  });

  test("nothing resolves: no anchor, no entries, no report material", async () => {
    // conv-1783448623-h424 — a 3-entry chain whose transcripts were all GC'd.
    // The existing behaviour (an empty array) must not regress into a report.
    const chain = await resolveAnchoredChain(["a", "b", "c"], resolverFor({}));
    expect(chain).toEqual({ anchorDir: null, kept: [], foreign: [] });
  });

  test("the FIRST resolvable session anchors, not the first listed", async () => {
    // `a` was GC'd, so `b` anchors — and `c`, in another worktree, is foreign.
    const chain = await resolveAnchoredChain(
      ["a", "b", "c"],
      resolverFor({ b: `${OWN}/b.jsonl`, c: `${OTHER}/c.jsonl` }),
    );
    expect(chain.anchorDir).toBe(OWN);
    expect(chain.kept.map((k) => k.sessionId)).toEqual(["b"]);
    expect(chain.foreign.map((f) => f.sessionId)).toEqual(["c"]);
  });

  test("a foreign entry FIRST in the chain anchors, and the rest go foreign", async () => {
    // The anchor is positional by design: it cannot know which directory is
    // "right", only that a conversation has exactly one. Whichever resolves
    // first wins, and the disagreement is still reported either way.
    const chain = await resolveAnchoredChain(
      ["x", "a", "b"],
      resolverFor({
        x: `${OTHER}/x.jsonl`,
        a: `${OWN}/a.jsonl`,
        b: `${OWN}/b.jsonl`,
      }),
    );
    expect(chain.anchorDir).toBe(OTHER);
    expect(chain.kept.map((k) => k.sessionId)).toEqual(["x"]);
    expect(chain.foreign.map((f) => f.sessionId)).toEqual(["a", "b"]);
  });

  test("entries from three directories all report against the one anchor", async () => {
    const THIRD = `${PROJECTS}/-wt--claude-worktrees-att-1700000000-zzzz`;
    const chain = await resolveAnchoredChain(
      ["a", "b", "c"],
      resolverFor({
        a: `${OWN}/a.jsonl`,
        b: `${OTHER}/b.jsonl`,
        c: `${THIRD}/c.jsonl`,
      }),
    );
    expect(chain.anchorDir).toBe(OWN);
    expect(chain.kept.map((k) => k.sessionId)).toEqual(["a"]);
    expect(chain.foreign.map((f) => f.dir)).toEqual([OTHER, THIRD]);
  });

  test("every entry carries the dir its own path sits in", async () => {
    const chain = await resolveAnchoredChain(
      ["a", "b"],
      resolverFor({ a: `${OWN}/a.jsonl`, b: `${OTHER}/b.jsonl` }),
    );
    expect(chain.kept[0]).toEqual({
      sessionId: "a",
      path: `${OWN}/a.jsonl`,
      dir: OWN,
    });
    expect(chain.foreign[0]).toEqual({
      sessionId: "b",
      path: `${OTHER}/b.jsonl`,
      dir: OTHER,
    });
  });
});
