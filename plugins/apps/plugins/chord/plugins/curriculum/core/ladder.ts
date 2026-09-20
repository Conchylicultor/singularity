import type { ChordToken } from "@plugins/apps/plugins/chord/plugins/song-index/core";
import type { HookpadMode } from "@plugins/integrations/plugins/hooktheory/core";
import { nextAskRule, type AskRule } from "./ask";
import {
  STAGES,
  stageById,
  stageIsOpen,
  stageOf,
  stageOrder,
  type Stage,
  type StageId,
} from "./stages";
import type { NextStep } from "./step";

// ── Which step comes next ────────────────────────────────────────────────────
//
// Pure: it is handed the counts and returns the step. Nothing here reads the
// database or the song index — `server/internal/next.ts` gathers the numbers,
// this decides. So the whole ordering can be checked without either.
//
// The rules, in order:
//
//   1. Climb the ask ladder first. While the round does not yet ask for the
//      whole loop, the next step is the next rung — no new chord arrives until
//      the learner names what they already hear.
//   2. Stay in the stage the last chord step came from, while its best chord is
//      still worth taking AND still worth as much as a fifth of the best step
//      available. One notion is finished before the next starts — but a
//      family's rare leftovers never hold up a much bigger one.
//   3. Otherwise take the best step anywhere: each open stage's best chord, and
//      each unopened stage's seed. Best means "opens the most songs".
//
// When nothing is worth taking, the ladder is done.

/** Where the learner stands: what they hear, and how much they name. */
export type LadderState = {
  unlocked: readonly ChordToken[];
  modes: readonly HookpadMode[];
  askRule: AskRule;
  /** The stage the last chord step came from — rule 2's "current stage". */
  stage: StageId;
};

/** One chord outside the unlocked set, and the windows unlocking it would add. */
export type ChordCandidate = { token: ChordToken; windows: number };

/** One unopened stage, and the windows its seed and modes together would add. */
export type StageEntry = { stage: StageId; windows: number };

export type LadderCounts = {
  /**
   * Every chord worth considering, already summed over the modes the learner
   * hears. Chords already unlocked, and chords no pool holds, are ignored.
   */
  candidates: readonly ChordCandidate[];
  /** One per stage that is not open yet. An open stage must not appear. */
  entries: readonly StageEntry[];
  /** Windows of the trainer's loop shape in the whole index: what the threshold scales off. */
  indexWindows: number;
};

export type NextStepChoice =
  /** `windows` is what the step opens; an ask-rule step opens no new loops, so it is 0. */
  { kind: "step"; step: NextStep; windows: number } | { kind: "done" };

/**
 * The smallest number of windows a step must open to be worth taking.
 *
 * A share of the index, never a fixed count: one window in 10,000, and at least
 * 5. A worktree loads a 5 % sample of the songs, so a fixed count would stall
 * there where main's full index flows.
 */
/**
 * How far below the best step available a family's next chord may fall and
 * still keep the ladder: a fifth. Above it, one notion is finished before the
 * next starts; below it, the family's leftovers wait their turn.
 */
export const STAGE_HOLD_SHARE = 0.2;

export function minStepWindows(indexWindows: number): number {
  if (!(Number.isFinite(indexWindows) && indexWindows >= 0)) {
    throw new Error(
      `minStepWindows: the index holds a non-negative number of windows, got ${indexWindows}`,
    );
  }
  return Math.max(5, Math.ceil(indexWindows / 10_000));
}

/** Rung 1 on its own, so a caller can skip gathering counts it will not read. */
export function askRuleStep(askRule: AskRule): NextStep | null {
  const rung = nextAskRule(askRule);
  return rung === null ? null : { kind: "ask", rule: rung };
}

export function chooseNextStep(
  state: LadderState,
  counts: LadderCounts,
): NextStepChoice {
  const rung = askRuleStep(state.askRule);
  if (rung !== null) return { kind: "step", step: rung, windows: 0 };

  const unlocked = new Set(state.unlocked);
  const modes = new Set(state.modes);
  const threshold = minStepWindows(counts.indexWindows);
  const best = bestChordPerStage(counts.candidates, unlocked, modes);

  // 3. The best step anywhere. Ties go to the earlier stage, then the earlier
  //    chord, so the same counts always give the same answer.
  const options = [
    ...[...best].map(([stage, candidate]) => ({
      stage,
      windows: candidate.windows,
      tokens: [candidate.token],
      modes: [] as HookpadMode[],
    })),
    ...entryOptions(counts.entries, unlocked, modes),
  ].sort(
    (a, b) =>
      b.windows - a.windows ||
      stageOrder(a.stage) - stageOrder(b.stage) ||
      (a.tokens[0] ?? "").localeCompare(b.tokens[0] ?? ""),
  );

  const top = options[0];
  if (top === undefined || top.windows < threshold) return { kind: "done" };

  // 2. Finish the stage in hand — while its next chord still earns its level.
  //    A family keeps the ladder as long as its best chord is worth at least a
  //    share of the best step available anywhere; a rare straggler (vii° opens
  //    a few dozen loops where minor keys open thousands) waits instead, and
  //    comes back once the families ahead of it have run down.
  const staying = best.get(state.stage);
  if (
    staying !== undefined &&
    staying.windows >= threshold &&
    staying.windows >= top.windows * STAGE_HOLD_SHARE
  ) {
    return chordStep(state.stage, [staying.token], [], staying.windows);
  }

  return chordStep(top.stage, top.tokens, top.modes, top.windows);
}

function chordStep(
  stage: StageId,
  tokens: readonly ChordToken[],
  modes: readonly HookpadMode[],
  windows: number,
): NextStepChoice {
  if (tokens.length === 0 && modes.length === 0) {
    throw new Error(
      `The ${stage} stage produced a step that unlocks nothing: neither a chord nor a key mode`,
    );
  }
  return {
    kind: "step",
    step: { kind: "chords", stage, tokens: [...tokens], modes: [...modes] },
    windows,
  };
}

/**
 * The best candidate chord of each OPEN stage. A chord already unlocked, or
 * one no pool holds (an inversion whose root-position twin is unknown), is not
 * a step. Ties inside a stage go to the earlier token.
 */
function bestChordPerStage(
  candidates: readonly ChordCandidate[],
  unlocked: ReadonlySet<ChordToken>,
  modes: ReadonlySet<HookpadMode>,
): Map<StageId, ChordCandidate> {
  const best = new Map<StageId, ChordCandidate>();
  for (const candidate of candidates) {
    if (unlocked.has(candidate.token)) continue;
    const stage = stageOf(candidate.token, unlocked);
    if (stage === null) continue;
    if (!stageIsOpen(stageById(stage), unlocked, modes)) continue;
    const current = best.get(stage);
    const better =
      current === undefined ||
      candidate.windows > current.windows ||
      (candidate.windows === current.windows &&
        candidate.token < current.token);
    if (better) best.set(stage, candidate);
  }
  return best;
}

/** Each unopened stage as a step: the seed chords still missing, and the modes still off. */
function entryOptions(
  entries: readonly StageEntry[],
  unlocked: ReadonlySet<ChordToken>,
  modes: ReadonlySet<HookpadMode>,
): {
  stage: StageId;
  windows: number;
  tokens: ChordToken[];
  modes: HookpadMode[];
}[] {
  return entries.flatMap((entry) => {
    const stage = stageById(entry.stage);
    if (stageIsOpen(stage, unlocked, modes)) return [];
    return [
      {
        stage: entry.stage,
        windows: entry.windows,
        tokens: stage.seed.filter((token) => !unlocked.has(token)),
        modes: stage.modes.filter((mode) => !modes.has(mode)),
      },
    ];
  });
}

/** The stages that are not open yet: the ones a `next` read must count an entry for. */
export function unopenedStages(
  unlocked: ReadonlySet<ChordToken>,
  modes: ReadonlySet<HookpadMode>,
): readonly Stage[] {
  return STAGES.filter((stage) => !stageIsOpen(stage, unlocked, modes));
}
