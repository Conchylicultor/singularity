import { describe, expect, test } from "bun:test";
import { ChordTokenSchema } from "@plugins/apps/plugins/chord/plugins/song-index/core";
import type { HookpadMode } from "@plugins/integrations/plugins/hooktheory/core";
import { FIRST_LEVEL } from "./first-level";
import {
  CurriculumSchema,
  curriculumFromSteps,
  firstCurriculum,
} from "./resource";
import { stageById, type StageId } from "./stages";
import { NextStepSchema, sameStep, type NextStep } from "./step";

const token = (text: string) => ChordTokenSchema.parse(text);
const I = token("0:4-3/0");
const IV = token("5:4-3/0");
const V = token("7:4-3/0");
const vi = token("9:3-4/0");
const MINOR_SEED = stageById("minor-keys").seed;

const chords = (
  stage: StageId,
  tokens: string[],
  modes: HookpadMode[] = [],
): NextStep => ({
  kind: "chords",
  stage,
  tokens: tokens.map(token),
  modes,
});

describe("the first level", () => {
  test("is I, IV and V in major keys, asking only for the chord being practised", () => {
    expect(FIRST_LEVEL.tokens.map(String)).toEqual([
      "0:4-3/0",
      "5:4-3/0",
      "7:4-3/0",
    ]);
    expect([...FIRST_LEVEL.modes]).toEqual(["major"]);
    expect(FIRST_LEVEL.askRule).toBe("target");
    expect(FIRST_LEVEL.stage).toBe("major-triads");
  });

  test("is a standing in its own right, and a valid one", () => {
    const start = firstCurriculum();
    expect(start).toEqual({
      level: 1,
      askRule: "target",
      askRuleLevel: 1,
      modes: ["major"],
      unlocked: [
        { token: I, level: 1 },
        { token: IV, level: 1 },
        { token: V, level: 1 },
      ],
      stage: "major-triads",
    });
    expect(CurriculumSchema.parse(start)).toEqual(start);
  });

  test("no step at all leaves the learner at level 1", () => {
    expect(curriculumFromSteps([])).toEqual(firstCurriculum());
  });
});

describe("curriculumFromSteps", () => {
  test("each step is one level, and a chord remembers the level it arrived at", () => {
    const standing = curriculumFromSteps([
      { kind: "ask", rule: "half" },
      { kind: "ask", rule: "all" },
      chords("major-triads", ["9:3-4/0"]),
    ]);
    expect(standing.level).toBe(4);
    expect(standing.askRule).toBe("all");
    expect(standing.unlocked).toEqual([
      { token: I, level: 1 },
      { token: IV, level: 1 },
      { token: V, level: 1 },
      { token: vi, level: 4 },
    ]);
    expect(standing.stage).toBe("major-triads");
  });

  test("the ask rule remembers the level it was raised at", () => {
    // Nobody has raised it: it is still the one everyone starts on.
    expect(curriculumFromSteps([]).askRuleLevel).toBe(1);
    expect(
      curriculumFromSteps([chords("major-triads", ["9:3-4/0"])]).askRuleLevel,
    ).toBe(1);
    // Raised at level 2, then again at level 3.
    const climbed = curriculumFromSteps([
      { kind: "ask", rule: "half" },
      { kind: "ask", rule: "all" },
      chords("major-triads", ["9:3-4/0"]),
    ]);
    expect(climbed.askRuleLevel).toBe(3);
    expect(climbed.askRule).toBe("all");
    // So the chord unlocked at level 4 is above the rung, and the starting
    // chords are not — which is what decides whether a round widens out.
    expect(climbed.unlocked.map((u) => u.level > climbed.askRuleLevel)).toEqual(
      [false, false, false, true],
    );
  });

  test("an ask step never moves the stage the ladder is working through", () => {
    const standing = curriculumFromSteps([
      chords("sevenths", ["7:4-3-3/0"]),
      { kind: "ask", rule: "half" },
    ]);
    expect(standing.stage).toBe("sevenths");
    expect(standing.level).toBe(3);
  });

  test("opening a stage adds its chords and its mode, in unlock order", () => {
    const standing = curriculumFromSteps([
      chords("minor-keys", [...MINOR_SEED].map(String), ["minor"]),
    ]);
    expect(standing.modes).toEqual(["major", "minor"]);
    expect(standing.unlocked.map((u) => u.token)).toEqual([
      I,
      IV,
      V,
      ...MINOR_SEED,
    ]);
    expect(standing.unlocked.filter((u) => u.level === 2)).toHaveLength(3);
    expect(standing.stage).toBe("minor-keys");
  });

  test("a chord or mode named twice keeps the level it first arrived at", () => {
    const standing = curriculumFromSteps([
      chords("major-triads", ["9:3-4/0"]),
      chords("major-triads", ["9:3-4/0", "2:3-4/0"], ["major"]),
    ]);
    expect(standing.unlocked.filter((u) => u.token === vi)).toEqual([
      { token: vi, level: 2 },
    ]);
    expect(standing.modes).toEqual(["major"]);
    expect(standing.level).toBe(3);
  });

  test("what comes out is always a valid standing", () => {
    const standing = curriculumFromSteps([
      { kind: "ask", rule: "half" },
      chords("mixolydian", [], ["mixolydian"]),
    ]);
    expect(CurriculumSchema.parse(standing)).toEqual(standing);
    expect(standing.modes).toEqual(["major", "mixolydian"]);
    expect(standing.unlocked).toHaveLength(3);
  });
});

describe("the step on the wire", () => {
  test("a step that opens nothing is refused", () => {
    expect(
      NextStepSchema.safeParse({
        kind: "chords",
        stage: "colour",
        tokens: [],
        modes: [],
      }).success,
    ).toBe(false);
    expect(
      NextStepSchema.safeParse({
        kind: "chords",
        stage: "mixolydian",
        tokens: [],
        modes: ["mixolydian"],
      }).success,
    ).toBe(true);
  });

  test("the target rung is never a step: everyone starts there", () => {
    expect(
      NextStepSchema.safeParse({ kind: "ask", rule: "target" }).success,
    ).toBe(false);
    expect(
      NextStepSchema.safeParse({ kind: "ask", rule: "half" }).success,
    ).toBe(true);
  });
});

describe("sameStep", () => {
  test("the same move, however it was built", () => {
    expect(
      sameStep(
        chords("major-triads", ["9:3-4/0"]),
        chords("major-triads", ["9:3-4/0"]),
      ),
    ).toBe(true);
    expect(
      sameStep({ kind: "ask", rule: "half" }, { kind: "ask", rule: "half" }),
    ).toBe(true);
  });

  test("a different stage, chord, mode, order or kind is a different move", () => {
    const base = chords("minor-keys", ["0:3-4/0", "10:4-3/0"], ["minor"]);
    expect(
      sameStep(base, chords("colour", ["0:3-4/0", "10:4-3/0"], ["minor"])),
    ).toBe(false);
    expect(sameStep(base, chords("minor-keys", ["0:3-4/0"], ["minor"]))).toBe(
      false,
    );
    expect(
      sameStep(base, chords("minor-keys", ["10:4-3/0", "0:3-4/0"], ["minor"])),
    ).toBe(false);
    expect(
      sameStep(base, chords("minor-keys", ["0:3-4/0", "10:4-3/0"], [])),
    ).toBe(false);
    expect(sameStep(base, { kind: "ask", rule: "all" })).toBe(false);
    expect(
      sameStep({ kind: "ask", rule: "all" }, { kind: "ask", rule: "half" }),
    ).toBe(false);
  });
});
