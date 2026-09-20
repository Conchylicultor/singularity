import { db } from "@plugins/database/server";
import { HttpError, implement } from "@plugins/infra/plugins/endpoints/server";
import {
  nextCurriculumStepEndpoint,
  sameStep,
  undoCurriculumStepEndpoint,
  unlockCurriculumStepEndpoint,
  type NextStep,
} from "../../core";
import { nextCurriculumStep } from "./next";
import { appendStep, dropLastStep } from "./state";

export const handleNextStep = implement(nextCurriculumStepEndpoint, () =>
  nextCurriculumStep(db),
);

/**
 * Take the step the learner was shown — and only that one. The server works
 * the next step out again and compares: the index may have grown since the
 * teaser was drawn, or another tab may have unlocked something in between, and
 * in either case what the learner agreed to is no longer what they would get.
 * A conflict says so rather than quietly unlocking something else.
 */
export const handleUnlockStep = implement(
  unlockCurriculumStepEndpoint,
  async ({ body }) => {
    const answer = await nextCurriculumStep(db);
    if (answer.kind === "not-ready") {
      throw new HttpError(
        409,
        "The song index is still loading, so the next step cannot be worked out yet",
      );
    }
    if (answer.kind === "done") {
      throw new HttpError(
        409,
        "There is no next step left: every chord the index can teach is unlocked",
      );
    }
    if (!sameStep(answer.step, body.expected)) {
      throw new HttpError(
        409,
        `The next step has changed since it was shown: it is now ${describe(answer.step)}, not ${describe(body.expected)}`,
      );
    }
    return { level: await appendStep(db, answer.step) };
  },
);

export const handleUndoStep = implement(
  undoCurriculumStepEndpoint,
  async () => {
    const undone = await dropLastStep(db);
    if (undone.kind === "nothing-to-undo") {
      throw new HttpError(
        409,
        "Nothing to undo: the learner is on the first level, which is where everyone starts",
      );
    }
    return { level: undone.level };
  },
);

/** One step in a sentence, for a conflict message. */
function describe(step: NextStep): string {
  if (step.kind === "ask") return `the "${step.rule}" ask rule`;
  const opens = [...step.tokens, ...step.modes].join(", ");
  return `${opens} (${step.stage})`;
}
