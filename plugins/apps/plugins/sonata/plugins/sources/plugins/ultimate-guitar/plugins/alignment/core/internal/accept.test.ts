import { describe, expect, test } from "bun:test";
import { chooseCandidate, RANK_MARGIN, type TriedCandidate } from "./accept";
import { WEAK_MATCH_THRESHOLD } from "./record";

const T = WEAK_MATCH_THRESHOLD;
const tried = (...scores: number[]): TriedCandidate[] =>
  scores.map((score, rank) => ({ videoId: `v${rank}`, rank, score }));

describe("chooseCandidate", () => {
  test("nothing passed: continue, or exhausted with the best try", () => {
    expect(
      chooseCandidate(tried(T - 0.3, T - 0.1), { exhausted: false }),
    ).toEqual({ kind: "continue" });
    expect(
      chooseCandidate(tried(T - 0.3, T - 0.1), { exhausted: true }),
    ).toEqual({
      kind: "exhausted",
      best: { videoId: "v1", rank: 1, score: T - 0.1 },
    });
    expect(chooseCandidate([], { exhausted: true })).toEqual({
      kind: "exhausted",
      best: null,
    });
  });

  test("the first try passing is accepted at once", () => {
    expect(chooseCandidate(tried(T), { exhausted: false })).toEqual({
      kind: "accept",
      videoId: "v0",
    });
  });

  test("a pass after a clear miss is accepted", () => {
    expect(
      chooseCandidate(tried(T - 0.3, T + 0.05), { exhausted: false }),
    ).toEqual({ kind: "accept", videoId: "v1" });
  });

  test("a higher-ranked near miss within the margin of the pass is preferred", () => {
    expect(
      chooseCandidate(tried(T - 0.02, T + RANK_MARGIN - 0.03), {
        exhausted: false,
      }),
    ).toEqual({ kind: "accept", videoId: "v0" });
  });

  test("rank, not try order, decides between close scores", () => {
    const out: TriedCandidate[] = [
      { videoId: "late", rank: 3, score: T + 0.05 },
      { videoId: "early", rank: 1, score: T + 0.02 },
    ];
    expect(chooseCandidate(out, { exhausted: false })).toEqual({
      kind: "accept",
      videoId: "early",
    });
  });
});
