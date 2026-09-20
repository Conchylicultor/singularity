import { describe, expect, test } from "bun:test";
import { ChordTokenSchema } from "@plugins/apps/plugins/chord/plugins/song-index/core";
import {
  FRESH_ANSWERS,
  askedPositions,
  nextAskRule,
  type AskedBox,
} from "./ask";

const token = (text: string) => ChordTokenSchema.parse(text);
const I = token("0:4-3/0");
const IV = token("5:4-3/0");
const V = token("7:4-3/0");

/** A 16-beat loop: I, IV, V, I, one chord per bar. */
const LOOP: AskedBox[] = [
  { position: 0, token: I, gridStart: 0 },
  { position: 1, token: IV, gridStart: 4 },
  { position: 2, token: V, gridStart: 8 },
  { position: 3, token: I, gridStart: 12 },
];

const asked = (
  boxes: AskedBox[],
  over: Partial<Parameters<typeof askedPositions>[1]> = {},
) =>
  askedPositions(boxes, {
    windowBeats: 16,
    askRule: "all",
    target: V,
    // A starting chord over a rung the learner has since paid for: old news.
    targetLevel: 1,
    askRuleLevel: 3,
    targetAnswers: 0,
    ...over,
  });

describe("nextAskRule", () => {
  test("target, then half, then all, and nothing after", () => {
    expect(nextAskRule("target")).toBe("half");
    expect(nextAskRule("half")).toBe("all");
    expect(nextAskRule("all")).toBeNull();
  });
});

describe("askedPositions", () => {
  test('"target" asks only for the chord being practised', () => {
    expect(asked(LOOP, { askRule: "target" })).toEqual([2]);
    expect(asked(LOOP, { askRule: "target", target: I })).toEqual([0, 3]);
  });

  test('"half" asks for the loop\'s second half', () => {
    expect(asked(LOOP, { askRule: "half" })).toEqual([2, 3]);
  });

  test("a box exactly on the midpoint is in the second half", () => {
    const boxes: AskedBox[] = [
      { position: 0, token: I, gridStart: 0 },
      { position: 1, token: V, gridStart: 8 },
    ];
    expect(asked(boxes, { askRule: "half" })).toEqual([1]);
  });

  test('"all" asks for every box', () => {
    expect(asked(LOOP)).toEqual([0, 1, 2, 3]);
  });

  test("a chord unlocked above the rung's level is asked alone whatever the rung says", () => {
    // The rung was set at level 3; this chord arrived at level 7.
    const newChord = { targetLevel: 7, askRuleLevel: 3 };
    for (const askRule of ["half", "all"] as const) {
      expect(asked(LOOP, { ...newChord, askRule, targetAnswers: 0 })).toEqual([
        2,
      ]);
      expect(
        asked(LOOP, { ...newChord, askRule, targetAnswers: FRESH_ANSWERS - 1 }),
      ).toEqual([2]);
    }
    // One answer more and the rung takes over.
    expect(
      asked(LOOP, {
        ...newChord,
        askRule: "all",
        targetAnswers: FRESH_ANSWERS,
      }),
    ).toEqual([0, 1, 2, 3]);
  });

  test("a chord the learner already had when they paid for the rung is NOT isolated", () => {
    // This is the bug the level comparison fixes: at level 1 every chord has
    // no answers, so a bare freshness test kept the round on one chord for the
    // whole of levels 2 and 3 — the learner paid for the cadence and then the
    // whole loop, and the screen never changed.
    expect(
      asked(LOOP, {
        askRule: "half",
        targetLevel: 1,
        askRuleLevel: 2,
        targetAnswers: 0,
      }),
    ).toEqual([2, 3]);
    expect(
      asked(LOOP, {
        askRule: "all",
        targetLevel: 1,
        askRuleLevel: 3,
        targetAnswers: 0,
      }),
    ).toEqual([0, 1, 2, 3]);
    // A chord unlocked at the same level as the rung counts as already there.
    expect(
      asked(LOOP, {
        askRule: "all",
        targetLevel: 4,
        askRuleLevel: 4,
        targetAnswers: 0,
      }),
    ).toEqual([0, 1, 2, 3]);
  });

  test("at level 1 the rung is `target`, so the round asks one chord anyway", () => {
    expect(
      asked(LOOP, {
        askRule: "target",
        targetLevel: 1,
        askRuleLevel: 1,
        targetAnswers: 0,
      }),
    ).toEqual([2]);
  });

  test("a rule that selects nothing falls back to the last box", () => {
    // A whole loop on one chord, starting on beat one: nothing in the second half.
    const vamp: AskedBox[] = [{ position: 0, token: I, gridStart: 0 }];
    expect(asked(vamp, { askRule: "half" })).toEqual([0]);
    // A target the window does not hold (find never offers one, but the rule
    // still has to answer with a box).
    expect(
      asked(LOOP, { askRule: "target", target: token("9:3-4/0") }),
    ).toEqual([3]);
  });

  test("the positions come back in beat order, however the boxes were given", () => {
    const shuffled = [LOOP[3], LOOP[0], LOOP[2], LOOP[1]].filter(
      (box): box is AskedBox => box !== undefined,
    );
    expect(asked(shuffled)).toEqual([0, 1, 2, 3]);
  });

  test("a round with no box, or a window of no beats, throws", () => {
    expect(() => asked([])).toThrow("at least one box");
    expect(() => asked(LOOP, { windowBeats: 0 })).toThrow("positive number");
    expect(() => asked(LOOP, { windowBeats: Number.NaN })).toThrow(
      "positive number",
    );
  });
});
