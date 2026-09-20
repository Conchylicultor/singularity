import { describe, expect, test } from "bun:test";
import {
  ChordTokenSchema,
  type ChordToken,
} from "@plugins/apps/plugins/chord/plugins/song-index/core";
import type { HookpadMode } from "@plugins/integrations/plugins/hooktheory/core";
import { FIRST_LEVEL } from "./first-level";
import {
  chooseNextStep,
  minStepWindows,
  unopenedStages,
  type LadderCounts,
  type LadderState,
} from "./ladder";
import { stageById } from "./stages";

const token = (text: string) => ChordTokenSchema.parse(text);

const I = token("0:4-3/0");
const IV = token("5:4-3/0");
const V = token("7:4-3/0");
const ii = token("2:3-4/0");
const vi = token("9:3-4/0");
const V7 = token("7:4-3-3/0");
const ii7 = token("2:3-4-3/0");
const V6 = token("7:4-3/1");
const V64 = token("7:4-3/2");
const I6 = token("0:4-3/1");
const I64 = token("0:4-3/2");
const VofV = token("2:4-3/0");
const MINOR_SEED = stageById("minor-keys").seed;

/** A learner at level 1 who has already climbed the ask ladder. */
const started: LadderState = {
  unlocked: [I, IV, V],
  modes: ["major"],
  askRule: "all",
  stage: "major-triads",
};

const counts = (over: Partial<LadderCounts> = {}): LadderCounts => ({
  candidates: [],
  entries: [],
  indexWindows: 100_000, // threshold 10
  ...over,
});

const stateWith = (over: Partial<LadderState> = {}): LadderState => ({
  ...started,
  ...over,
});

describe("minStepWindows", () => {
  test("one window in ten thousand, never under five", () => {
    expect(minStepWindows(0)).toBe(5);
    expect(minStepWindows(8_859)).toBe(5); // a worktree's 5 % sample
    expect(minStepWindows(100_000)).toBe(10);
    expect(minStepWindows(183_270)).toBe(19); // the full index
  });

  test("a nonsense total throws rather than setting a nonsense bar", () => {
    expect(() => minStepWindows(-1)).toThrow("non-negative");
    expect(() => minStepWindows(Number.NaN)).toThrow("non-negative");
  });
});

describe("rule 1 — the ask ladder comes first", () => {
  test("target, then half, then all, before any chord", () => {
    const rich = counts({ candidates: [{ token: vi, windows: 5_000 }] });
    expect(chooseNextStep(stateWith({ askRule: "target" }), rich)).toEqual({
      kind: "step",
      step: { kind: "ask", rule: "half" },
      windows: 0,
    });
    expect(chooseNextStep(stateWith({ askRule: "half" }), rich)).toEqual({
      kind: "step",
      step: { kind: "ask", rule: "all" },
      windows: 0,
    });
    expect(chooseNextStep(stateWith({ askRule: "all" }), rich)).toEqual({
      kind: "step",
      step: { kind: "chords", stage: "major-triads", tokens: [vi], modes: [] },
      windows: 5_000,
    });
  });

  test("the learner everyone starts as gets the half rung", () => {
    const start: LadderState = {
      unlocked: [...FIRST_LEVEL.tokens],
      modes: [...FIRST_LEVEL.modes],
      askRule: FIRST_LEVEL.askRule,
      stage: FIRST_LEVEL.stage,
    };
    expect(chooseNextStep(start, counts())).toEqual({
      kind: "step",
      step: { kind: "ask", rule: "half" },
      windows: 0,
    });
  });
});

describe("rule 2 — finish the stage in hand", () => {
  test("a stage keeps its turn even when another stage's chord is worth more", () => {
    const step = chooseNextStep(
      started,
      counts({
        candidates: [
          { token: vi, windows: 500 }, // major-triads, the current stage
          { token: V7, windows: 900 }, // sevenths, worth more
        ],
      }),
    );
    expect(step).toEqual({
      kind: "step",
      step: { kind: "chords", stage: "major-triads", tokens: [vi], modes: [] },
      windows: 500,
    });
  });

  test("a straggler does not hold up a far bigger step elsewhere", () => {
    // Worth taking on its own (30 is over the threshold of 10), but under a
    // fifth of the 900 on offer elsewhere: the family waits its turn. This is
    // vii° against minor keys, which is how the real index reads.
    const step = chooseNextStep(
      started,
      counts({
        candidates: [
          { token: vi, windows: 30 },
          { token: V7, windows: 900 },
        ],
      }),
    );
    expect(step).toMatchObject({
      step: { stage: "sevenths", tokens: [V7] },
    });
  });

  test("a fifth of the best step anywhere is enough to keep the stage", () => {
    const step = chooseNextStep(
      started,
      counts({
        candidates: [
          { token: vi, windows: 180 }, // exactly a fifth of 900
          { token: V7, windows: 900 },
        ],
      }),
    );
    expect(step).toMatchObject({
      step: { stage: "major-triads", tokens: [vi] },
    });
  });

  test("once the stage runs dry, the best step anywhere wins", () => {
    const step = chooseNextStep(
      started,
      counts({
        candidates: [
          { token: vi, windows: 9 }, // under the threshold of 10
          { token: V7, windows: 900 },
        ],
      }),
    );
    expect(step).toEqual({
      kind: "step",
      step: { kind: "chords", stage: "sevenths", tokens: [V7], modes: [] },
      windows: 900,
    });
  });

  test("inside a stage the best chord wins, and a tie goes to the earlier token", () => {
    const step = chooseNextStep(
      started,
      counts({
        candidates: [
          { token: ii, windows: 300 },
          { token: vi, windows: 500 },
        ],
      }),
    );
    expect(step).toMatchObject({
      step: { tokens: [vi] },
      windows: 500,
    });
    const tied = chooseNextStep(
      started,
      counts({
        candidates: [
          { token: vi, windows: 300 },
          { token: ii, windows: 300 },
        ],
      }),
    );
    expect(tied).toMatchObject({ step: { tokens: [ii] } });
  });
});

describe("rule 3 — the best step anywhere", () => {
  const dry = { token: vi, windows: 1 };

  test("an unopened stage's seed competes with every open stage's chord", () => {
    const step = chooseNextStep(
      started,
      counts({
        candidates: [dry, { token: V7, windows: 200 }],
        entries: [
          { stage: "minor-keys", windows: 338 },
          { stage: "mixolydian", windows: 40 },
        ],
      }),
    );
    expect(step).toEqual({
      kind: "step",
      step: {
        kind: "chords",
        stage: "minor-keys",
        tokens: [...MINOR_SEED],
        modes: ["minor"],
      },
      windows: 338,
    });
  });

  test("a modal stage opens a mode and no chord", () => {
    const step = chooseNextStep(
      started,
      counts({
        candidates: [dry],
        entries: [{ stage: "mixolydian", windows: 700 }],
      }),
    );
    expect(step).toEqual({
      kind: "step",
      step: {
        kind: "chords",
        stage: "mixolydian",
        tokens: [],
        modes: ["mixolydian"],
      },
      windows: 700,
    });
  });

  test("a seed already half unlocked only offers what is missing", () => {
    const [i, flatVII, flatVI] = MINOR_SEED;
    if (i === undefined || flatVII === undefined || flatVI === undefined) {
      throw new Error("the minor-keys seed is three chords");
    }
    const step = chooseNextStep(
      stateWith({ unlocked: [I, IV, V, i] }),
      counts({
        candidates: [dry],
        entries: [{ stage: "minor-keys", windows: 338 }],
      }),
    );
    expect(step).toMatchObject({
      step: {
        stage: "minor-keys",
        tokens: [flatVII, flatVI],
        modes: ["minor"],
      },
    });
  });

  test("ties go to the earlier stage", () => {
    const step = chooseNextStep(
      started,
      counts({
        candidates: [
          { token: V7, windows: 100 }, // sevenths
          { token: VofV, windows: 100 }, // secondary, later in the order
        ],
      }),
    );
    expect(step).toMatchObject({ step: { stage: "sevenths" } });
  });

  test("nothing above the bar is the end of the ladder", () => {
    expect(
      chooseNextStep(
        started,
        counts({
          candidates: [{ token: vi, windows: 9 }],
          entries: [{ stage: "minor-keys", windows: 4 }],
        }),
      ),
    ).toEqual({ kind: "done" });
  });

  test("the bar follows the index: a small sample passes what a full one would not", () => {
    const thin = counts({
      candidates: [{ token: vi, windows: 8 }],
      indexWindows: 8_859,
    });
    expect(chooseNextStep(started, thin)).toMatchObject({ kind: "step" });
    expect(chooseNextStep(started, { ...thin, indexWindows: 183_270 })).toEqual(
      { kind: "done" },
    );
  });
});

describe("which chords are candidates at all", () => {
  test("a chord already unlocked is not a step", () => {
    expect(
      chooseNextStep(
        started,
        counts({ candidates: [{ token: V, windows: 900 }] }),
      ),
    ).toEqual({ kind: "done" });
  });

  test("a chord of an unopened stage waits for its stage", () => {
    // ♭VII belongs to minor-keys, which is not open: it cannot be taken alone.
    const flatVII = token("10:4-3/0");
    expect(
      chooseNextStep(
        started,
        counts({ candidates: [{ token: flatVII, windows: 900 }] }),
      ),
    ).toEqual({ kind: "done" });
  });

  test("an inversion is a step only once its root position is known", () => {
    const withoutV7 = counts({
      candidates: [{ token: token("7:4-3-3/1"), windows: 900 }],
    });
    expect(chooseNextStep(started, withoutV7)).toEqual({ kind: "done" });
    // V is unlocked, so V⁶ is offered.
    expect(
      chooseNextStep(
        started,
        counts({ candidates: [{ token: V6, windows: 900 }] }),
      ),
    ).toMatchObject({ step: { stage: "inversions", tokens: [V6] } });
  });

  test("an entry for a stage that is in fact open is ignored", () => {
    expect(
      chooseNextStep(
        started,
        counts({ entries: [{ stage: "sevenths", windows: 900 }] }),
      ),
    ).toEqual({ kind: "done" });
  });
});

describe("a step unlocks a notion, not a chord", () => {
  test("every inversion of one chord arrives in a single step, biggest first", () => {
    const step = chooseNextStep(
      started,
      counts({
        candidates: [
          { token: V6, windows: 300 },
          { token: V64, windows: 500 },
        ],
      }),
    );
    expect(step).toEqual({
      kind: "step",
      step: {
        kind: "chords",
        stage: "inversions",
        tokens: [V64, V6],
        modes: [],
      },
      windows: 500,
    });
  });

  test("inversions of different chords are different notions, and the bigger one wins", () => {
    const step = chooseNextStep(
      started,
      counts({
        candidates: [
          { token: V6, windows: 300 },
          { token: I6, windows: 500 },
          { token: I64, windows: 100 },
        ],
      }),
    );
    // I's inversions, both of them — V⁶ is another notion and waits its turn.
    expect(step).toEqual({
      kind: "step",
      step: {
        kind: "chords",
        stage: "inversions",
        tokens: [I6, I64],
        modes: [],
      },
      windows: 500,
    });
  });

  test("a notion is worth its best member, not its members added up", () => {
    // 300 + 300 would outrank the 500 seventh; the best member (300) does not.
    const step = chooseNextStep(
      started,
      counts({
        candidates: [
          { token: V6, windows: 300 },
          { token: V64, windows: 300 },
          { token: V7, windows: 500 },
        ],
      }),
    );
    expect(step).toEqual({
      kind: "step",
      step: { kind: "chords", stage: "sevenths", tokens: [V7], modes: [] },
      windows: 500,
    });
    // And on its own the bundle reports 300, the best member's — a tie inside
    // the notion goes to the earlier token.
    expect(
      chooseNextStep(
        started,
        counts({
          candidates: [
            { token: V64, windows: 300 },
            { token: V6, windows: 300 },
          ],
        }),
      ),
    ).toEqual({
      kind: "step",
      step: {
        kind: "chords",
        stage: "inversions",
        tokens: [V6, V64],
        modes: [],
      },
      windows: 300,
    });
  });

  test("the stage in hand hands back the whole notion, not one of its chords", () => {
    const step = chooseNextStep(
      stateWith({ stage: "inversions" }),
      counts({
        candidates: [
          { token: V6, windows: 300 },
          { token: V64, windows: 200 },
          { token: V7, windows: 900 }, // 300 is over a fifth of it, so V stays
        ],
      }),
    );
    expect(step).toMatchObject({
      step: { stage: "inversions", tokens: [V6, V64] },
      windows: 300,
    });
  });

  test("a stage that bundles nothing still unlocks one chord at a time", () => {
    for (const [stage, candidates] of [
      [
        "major-triads",
        [
          { token: vi, windows: 500 },
          { token: ii, windows: 300 },
        ],
      ],
      [
        "sevenths",
        [
          { token: V7, windows: 500 },
          { token: ii7, windows: 300 },
        ],
      ],
    ] as const) {
      expect(chooseNextStep(started, counts({ candidates }))).toMatchObject({
        step: { stage, tokens: [candidates[0].token] },
        windows: 500,
      });
    }
  });
});

describe("unopenedStages", () => {
  test("at level 1, the minor and modal stages are the ones left to open", () => {
    const open = unopenedStages(
      new Set<ChordToken>([I, IV, V]),
      new Set<HookpadMode>(["major"]),
    ).map((stage) => stage.id);
    expect(open).toEqual([
      "minor-keys",
      "mixolydian",
      "dorian",
      "lydian",
      "phrygian",
    ]);
  });
});
