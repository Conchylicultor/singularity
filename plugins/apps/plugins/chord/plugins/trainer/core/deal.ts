import type {
  ChordToken,
  LoopCandidate,
} from "@plugins/apps/plugins/chord/plugins/song-index/core";
import {
  askedPositions,
  type Blanks,
} from "@plugins/apps/plugins/chord/plugins/curriculum/core";
import { gridBoxes } from "./round";

// ── Dealing a loop: its asked boxes, decided once ────────────────────────────
//
// The round on screen is frozen: which of its boxes wait for an answer is
// decided when the loop is dealt (a `random` draw included) and travels with
// it, so a change to the selection mid-round never deals it again. The
// change applies from the next loop.

/** A loop as the trainer holds it: the candidate, the boxes it asks, and the blanks they were chosen by. */
export type DealtLoop = {
  candidate: LoopCandidate;
  /** The positions the learner must name, in beat order. Never empty. */
  asked: readonly number[];
  /** The blanks setting `asked` was drawn with: saved with the round. */
  blanks: Blanks;
};

/**
 * Deal `candidate` for this selection: its asked boxes by `askedPositions`.
 * Throws when the loop holds no practised chord — `find` returns only loops
 * that do, so one would mean it was asked for another selection.
 */
export function dealLoop(
  candidate: LoopCandidate,
  opts: {
    practised: ReadonlySet<ChordToken>;
    blanks: Blanks;
    /** `random`'s draw, as `Math.random` (the default). */
    random?: () => number;
  },
): DealtLoop {
  const { window } = candidate;
  return {
    candidate,
    asked: askedPositions(gridBoxes(candidate), {
      windowBeats: window.endBeat - window.startBeat,
      blanks: opts.blanks,
      practised: opts.practised,
      random: opts.random,
    }),
    blanks: opts.blanks,
  };
}
