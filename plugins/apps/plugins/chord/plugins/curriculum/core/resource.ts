import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import { ChordTokenSchema } from "@plugins/apps/plugins/chord/plugins/song-index/core";
import { HookpadModeSchema } from "@plugins/integrations/plugins/hooktheory/core";
import { AskRuleSchema } from "./ask";
import { FIRST_LEVEL } from "./first-level";
import { StageIdSchema } from "./stages";
import type { NextStep } from "./step";

// ── What the learner has: `chord.curriculum` ─────────────────────────────────
//
// The whole standing, read back from the steps taken. It is what the trainer
// draws its palette and its ask rule from, so it is live: unlocking a step
// changes every open tab.

export const UnlockedChordSchema = z.object({
  token: ChordTokenSchema,
  /** The level it arrived at: 1 for the starting chords. */
  level: z.number().int().min(1),
});
export type UnlockedChord = z.infer<typeof UnlockedChordSchema>;

export const CurriculumSchema = z.object({
  /** How many steps have been taken, plus one. Level 1 is the start. */
  level: z.number().int().min(1),
  askRule: AskRuleSchema,
  /**
   * The level the ask rule was last raised at; 1 while it is still `target`.
   * A chord unlocked above this level is new to the rung, so the round asks
   * for it alone until it settles (`targetIsIsolated`).
   */
  askRuleLevel: z.number().int().min(1),
  /** The key modes the learner hears, in the order they opened. */
  modes: z.array(HookpadModeSchema).min(1),
  /** Every chord the learner hears, in unlock order. */
  unlocked: z.array(UnlockedChordSchema).min(1),
  /** The stage the last chord step came from: where the ladder carries on. */
  stage: StageIdSchema,
});
export type Curriculum = z.infer<typeof CurriculumSchema>;

/** Level 1 as a standing: nobody has taken a step yet. */
export function firstCurriculum(): Curriculum {
  return {
    level: 1,
    askRule: FIRST_LEVEL.askRule,
    askRuleLevel: 1,
    modes: [...FIRST_LEVEL.modes],
    unlocked: FIRST_LEVEL.tokens.map((token) => ({ token, level: 1 })),
    stage: FIRST_LEVEL.stage,
  };
}

/**
 * The standing after these steps, oldest first: level 1 plus what each step
 * added.
 *
 * A chord unlocked twice keeps the level it first arrived at, and so does a
 * mode — the list says when the learner first heard it, not the last time a
 * step mentioned it.
 */
export function curriculumFromSteps(steps: readonly NextStep[]): Curriculum {
  const standing = firstCurriculum();
  const seen = new Map(standing.unlocked.map((u) => [u.token, u] as const));
  const modes = new Set(standing.modes);
  for (const [index, step] of steps.entries()) {
    const level = index + 2;
    standing.level = level;
    if (step.kind === "ask") {
      standing.askRule = step.rule;
      standing.askRuleLevel = level;
      continue;
    }
    standing.stage = step.stage;
    for (const token of step.tokens) {
      if (seen.has(token)) continue;
      const unlocked = { token, level };
      seen.set(token, unlocked);
      standing.unlocked.push(unlocked);
    }
    for (const mode of step.modes) {
      if (modes.has(mode)) continue;
      modes.add(mode);
      standing.modes.push(mode);
    }
  }
  return standing;
}

/**
 * What the learner has unlocked, and how much of a loop they name. Pushed again
 * whenever a step is taken or undone.
 *
 * The descriptor API requires an initial value; this one is the true starting
 * point, but it is still never what a surface shows: `useResource` seeds it at
 * `dataUpdatedAt === 0` and answers `pending` until the server's first value
 * lands, so the trainer renders its loading state rather than a palette that
 * might be about to grow.
 */
export const chordCurriculumResource = resourceDescriptor<Curriculum>(
  "chord.curriculum",
  CurriculumSchema,
  firstCurriculum(),
);
