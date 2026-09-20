import { z } from "zod";
import type { ChordToken } from "@plugins/apps/plugins/chord/plugins/song-index/core";

// ── How much of the loop the learner names ───────────────────────────────────
//
// Every box of a round shows a chord or waits for one. The ask rule says which
// boxes wait: the others are GIVEN, already showing their chord, so the round
// asks for one notion at a time instead of four chords in a row.
//
// Three rungs, climbed once each, early:
//
//   target → only the boxes of the chord being practised
//   half   → every box in the loop's second half (the cadence)
//   all    → every box
//
// And one rule that overrides the rung: a chord that is NEW is asked ALONE
// until it has `FRESH_ANSWERS` answers, whatever the rung says. So every new
// notion arrives isolated and widens out on its own.
//
// New means "arrived after the learner widened out", not "not practised much".
// Both the chords and the rungs are steps on one ladder, so the comparison is
// between levels: a chord is isolated while it was unlocked at a HIGHER level
// than the one the current rung was set at. The starting chords are level 1, so
// paying for the cadence at level 2 really widens the round out, instead of the
// round staying on one chord until every starting chord has ten answers. A
// chord unlocked at level 7 over a rung set at level 3 is isolated, which is
// the case the rule is for. An under-practised old chord is not isolated —
// being chosen as the target is already what looks after it.

export const ASK_RULES = ["target", "half", "all"] as const;
export const AskRuleSchema = z.enum(ASK_RULES);
export type AskRule = z.infer<typeof AskRuleSchema>;

/** Answers a new chord needs before the round stops asking for it alone. */
export const FRESH_ANSWERS = 10;

/**
 * Whether the round asks for this chord's boxes and nothing else: it arrived
 * after the rung the round is on was set, and it is still new.
 */
export function targetIsIsolated(opts: {
  /** The level the target chord was unlocked at. */
  targetLevel: number;
  /** The level the current ask rule was set at; 1 when no rung has been taken. */
  askRuleLevel: number;
  /** How many answers the target already has. */
  targetAnswers: number;
}): boolean {
  return (
    opts.targetLevel > opts.askRuleLevel && opts.targetAnswers < FRESH_ANSWERS
  );
}

/** The rung above this one, or `null` at the top — there is nothing after `all`. */
export function nextAskRule(rule: AskRule): "half" | "all" | null {
  switch (rule) {
    case "target":
      return "half";
    case "half":
      return "all";
    case "all":
      return null;
  }
}

/** What the rule reads of one box of the round (see `trainer/core` `Box`). */
export type AskedBox = {
  /** The box's place in the round, 0-based, in beat order. */
  position: number;
  /** The chord that sounds there. */
  token: ChordToken;
  /** Beats from the window's start to the box's start. */
  gridStart: number;
};

export type AskedOptions = {
  /** The window's length in beats: the `half` rung splits it down the middle. */
  windowBeats: number;
  askRule: AskRule;
  /** The chord being practised. `find` guarantees the window holds it. */
  target: ChordToken;
  /** The level the target was unlocked at. */
  targetLevel: number;
  /** The level the ask rule was last set at; 1 when no rung has been taken. */
  askRuleLevel: number;
  /** How many answers the target already has. */
  targetAnswers: number;
};

/**
 * Which boxes of the round wait for an answer, in beat order. Every other box
 * is given.
 *
 * **Never empty.** A rule that selects nothing — the second half of a loop
 * whose only chord starts on beat one — falls back to the round's last box, so
 * there is always something to name. That is a fallback, not a silent one: it
 * is the documented answer for a loop the rule has nothing to say about.
 */
export function askedPositions(
  boxes: readonly AskedBox[],
  opts: AskedOptions,
): number[] {
  const last = boxes.at(-1);
  if (last === undefined) {
    throw new Error("askedPositions: a round has at least one box");
  }
  if (!(Number.isFinite(opts.windowBeats) && opts.windowBeats > 0)) {
    throw new Error(
      `askedPositions: a window lasts a positive number of beats, got ${opts.windowBeats}`,
    );
  }

  const selected =
    opts.askRule === "target" || targetIsIsolated(opts)
      ? boxes.filter((box) => box.token === opts.target)
      : opts.askRule === "half"
        ? boxes.filter((box) => box.gridStart >= opts.windowBeats / 2)
        : [...boxes];

  const asked = selected.length === 0 ? [last] : selected;
  return asked.map((box) => box.position).sort((a, b) => a - b);
}
