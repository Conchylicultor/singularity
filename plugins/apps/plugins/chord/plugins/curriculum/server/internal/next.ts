import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import {
  DEFAULT_LOOP_SHAPE,
  NEXT_CHORDS_MAX_LIMIT,
  windowsInModes,
} from "@plugins/apps/plugins/chord/plugins/song-index/core";
import {
  countLoopsByNextChord,
  countLoopsInSet,
  loadIndexStatus,
} from "@plugins/apps/plugins/chord/plugins/song-index/server";
import {
  askRuleStep,
  chooseNextStep,
  unopenedStages,
  type Curriculum,
  type LadderCounts,
  type LadderState,
  type NextStepAnswer,
} from "../../core";
import { loadCurriculum } from "./state";

// ── Working out the next step ────────────────────────────────────────────────
//
// The counts come from the song index; the decision is `chooseNextStep`, which
// is pure. This file is only the gathering, and it is the expensive half: one
// scan over the loop windows for the candidate chords, plus one count per stage
// the learner has not opened yet. That is why it is an endpoint and not a live
// resource — a resource over those tables would recompute it on every row a
// load writes.

const ladderState = (curriculum: Curriculum): LadderState => ({
  unlocked: curriculum.unlocked.map((u) => u.token),
  modes: curriculum.modes,
  askRule: curriculum.askRule,
  stage: curriculum.stage,
});

/**
 * The step on offer, or why there is none.
 *
 * Answers `not-ready` whenever the index is not loaded: with no windows to
 * count, "nothing is worth unlocking" and "I cannot tell yet" are the same
 * answer, and only one of them is true.
 */
export async function nextCurriculumStep(
  db: NodePgDatabase,
): Promise<NextStepAnswer> {
  const status = await loadIndexStatus();
  if (status.kind !== "ready") return { kind: "not-ready", status };

  const curriculum = await loadCurriculum(db);

  // Rung 1 of the ladder, asked before anything is counted: while the round
  // does not yet ask for the whole loop, no chord step can win, so the scans
  // would be work for an answer already known. Same function the chooser runs.
  const rung = askRuleStep(curriculum.askRule);
  if (rung !== null) return { kind: "step", step: rung, windows: 0 };

  const counts = await gatherCounts(curriculum, status.windows);
  const choice = chooseNextStep(ladderState(curriculum), counts);
  return choice.kind === "done"
    ? { kind: "done" }
    : { kind: "step", step: choice.step, windows: choice.windows };
}

/**
 * What the index says each possible step is worth.
 *
 * - **A chord**: one `next-chords` scan, counted per key mode in one pass, so
 *   each candidate is summed over the modes this learner actually hears — no
 *   second scan per mode.
 * - **A stage**: the windows its seed and its modes open together, as the
 *   difference between what the learner can hear now and what they could hear
 *   with the stage open. A stage whose seed opens no NEW loop is worth nothing,
 *   which is exactly what the subtraction says.
 * - **The index**: how many windows of the trainer's shape exist at all, which
 *   is what the "worth taking" threshold is a share of. The ready status
 *   already carries it, and `bars-4` is the only shape.
 */
async function gatherCounts(
  curriculum: Curriculum,
  indexWindows: number,
): Promise<LadderCounts> {
  const unlocked = curriculum.unlocked.map((u) => u.token);
  const modes = curriculum.modes;
  const closed = unopenedStages(new Set(unlocked), new Set(modes));

  const [rows, reachable, entryTotals] = await Promise.all([
    countLoopsByNextChord({
      unlocked,
      shape: DEFAULT_LOOP_SHAPE,
      limit: NEXT_CHORDS_MAX_LIMIT,
    }),
    countLoopsInSet({ unlocked, modes, shape: DEFAULT_LOOP_SHAPE }),
    Promise.all(
      closed.map((stage) =>
        countLoopsInSet({
          unlocked: [...new Set([...unlocked, ...stage.seed])],
          modes: [...new Set([...modes, ...stage.modes])],
          shape: DEFAULT_LOOP_SHAPE,
        }),
      ),
    ),
  ]);

  return {
    candidates: rows.map((row) => ({
      token: row.token,
      windows: windowsInModes(row, modes),
    })),
    entries: closed.map((stage, index) => {
      const total = entryTotals[index];
      if (total === undefined) {
        throw new Error(
          `No window count came back for the ${stage.id} stage, one of the ${closed.length} asked for`,
        );
      }
      return { stage: stage.id, windows: Math.max(0, total - reachable) };
    }),
    indexWindows,
  };
}
