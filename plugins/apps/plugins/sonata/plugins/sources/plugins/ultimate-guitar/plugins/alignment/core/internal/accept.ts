import { WEAK_MATCH_THRESHOLD } from "./record";

/**
 * How far below the best score a higher-ranked candidate may be and still be
 * preferred. The ranking already says which video is most likely the studio
 * recording; an alignment score a little higher on a lower-ranked one (a live
 * take, an upload with a longer intro) is not evidence enough to overrule it.
 * Uploads of the same audio score within ~0.03 of each other
 * (`scripts/calibrate.ts --set`).
 */
export const RANK_MARGIN = 0.1;

/**
 * Candidates one resolver run tries at most. Each costs a download and a beat
 * analysis (~30–60 s); past three, the ranking has failed and the user is
 * better asked. Core, so the Recording section can say "video 2 of 3".
 */
export const MAX_TRIES_PER_RUN = 3;

/** One candidate the walk has aligned. */
export interface TriedCandidate {
  videoId: string;
  /** Its position in the ranking, 0 = the best. */
  rank: number;
  score: number;
}

export type CandidateChoice =
  /** Take this video. */
  | { kind: "accept"; videoId: string }
  /** Nothing passed yet: try the next candidate. */
  | { kind: "continue" }
  /** The walk is over and nothing passed: the best try, to play while the user is asked. */
  | { kind: "exhausted"; best: TriedCandidate | null };

/**
 * The resolver's decision after each try. Once any tried candidate reaches
 * `WEAK_MATCH_THRESHOLD`, take the highest-ranked candidate scoring within
 * `RANK_MARGIN` of the best one tried — usually the one that passed, but a
 * higher-ranked near miss when the pass only just beat it. Candidates further
 * down the ranking are never tried for that: they could only win by beating
 * the pass by more than the margin, and the ranking says they are less likely
 * the recording. Nothing passed: `continue`, or `exhausted` with the best try
 * once the walk has nothing more to try.
 */
export function chooseCandidate(
  tried: readonly TriedCandidate[],
  opts: { exhausted: boolean },
): CandidateChoice {
  let best: TriedCandidate | null = null;
  for (const t of tried) if (best === null || t.score > best.score) best = t;
  if (best !== null && best.score >= WEAK_MATCH_THRESHOLD) {
    const preferred = [...tried]
      .sort((a, b) => a.rank - b.rank)
      .find((t) => t.score >= best.score - RANK_MARGIN)!;
    return { kind: "accept", videoId: preferred.videoId };
  }
  return opts.exhausted ? { kind: "exhausted", best } : { kind: "continue" };
}
