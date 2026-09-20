import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";
import { IndexStatusSchema } from "@plugins/apps/plugins/chord/plugins/song-index/core";
import { NextStepSchema } from "./step";

// ── Taking a step ────────────────────────────────────────────────────────────
//
// Three writes' worth of surface, and one expensive read. The read is an
// endpoint rather than a live resource on purpose: working out the next step
// scans the loop windows once per stage, and a resource keyed on those tables
// would recompute it on every row a load writes.

const LevelSchema = z.object({
  /** The level the learner is now on. */
  level: z.number().int().min(1),
});
export type CurriculumLevel = z.infer<typeof LevelSchema>;

/**
 * The step on offer.
 *
 * `not-ready` while the song index is still loading — never `done`, which
 * would read as "there is nothing left to learn". `windows` is how many loops
 * the step opens; an ask-rule step opens none, so it is 0.
 */
export const NextStepAnswerSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("not-ready"), status: IndexStatusSchema }),
  z.object({
    kind: z.literal("step"),
    step: NextStepSchema,
    windows: z.number().int().min(0),
  }),
  z.object({ kind: z.literal("done") }),
]);
export type NextStepAnswer = z.infer<typeof NextStepAnswerSchema>;

export const nextCurriculumStepEndpoint = defineEndpoint({
  route: "POST /api/chord/curriculum/next",
  response: NextStepAnswerSchema,
});

export const UnlockStepBodySchema = z.object({
  /** The step the learner was shown, as `next` gave it. */
  expected: NextStepSchema,
});
export type UnlockStepBody = z.infer<typeof UnlockStepBodySchema>;

/**
 * Take the step. The server works the next step out again and refuses with a
 * conflict when it differs from `expected` — the index moved, or another tab
 * took a step first. A client never invents a step.
 */
export const unlockCurriculumStepEndpoint = defineEndpoint({
  route: "POST /api/chord/curriculum/unlock",
  body: UnlockStepBodySchema,
  response: LevelSchema,
});

/** Drop the last step taken. Refuses at level 1, where there is none. */
export const undoCurriculumStepEndpoint = defineEndpoint({
  route: "POST /api/chord/curriculum/undo",
  response: LevelSchema,
});
