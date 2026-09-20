import {
  parseChordToken,
  type ChordToken,
} from "@plugins/apps/plugins/chord/plugins/song-index/core";
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
//   2. Stay in the stage the last chord step came from, while its best notion
//      is still worth taking AND still worth as much as a fifth of the best
//      step available. One notion is finished before the next starts — but a
//      family's rare leftovers never hold up a much bigger one.
//   3. Otherwise take the best step anywhere: each open stage's best notion, and
//      each unopened stage's seed. Best means "opens the most songs".
//
// When nothing is worth taking, the ladder is done.
//
// A step unlocks a NOTION, not a chord: the stage says which of its candidates
// are one idea (`Stage.notion`), and they arrive together. For every stage but
// inversions a notion is one chord, so a step is one chord; an inversions step
// carries every inversion of one root-position twin.

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
  const best = bestNotionPerStage(counts.candidates, unlocked, modes);

  // 3. The best step anywhere. Ties go to the earlier stage, then the earlier
  //    chord, so the same counts always give the same answer.
  const options = [
    ...[...best].map(([stage, notion]) => ({
      stage,
      windows: notion.windows,
      tokens: notion.tokens,
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

  // 2. Finish the stage in hand — while its next notion still earns its level.
  //    A family keeps the ladder as long as its best notion is worth at least a
  //    share of the best step available anywhere; a rare straggler (vii° opens
  //    a few dozen loops where minor keys open thousands) waits instead, and
  //    comes back once the families ahead of it have run down.
  const staying = best.get(state.stage);
  if (
    staying !== undefined &&
    staying.windows >= threshold &&
    staying.windows >= top.windows * STAGE_HOLD_SHARE
  ) {
    return chordStep(state.stage, staying.tokens, [], staying.windows);
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

/** One notion as a step: every chord it bundles, and what taking it opens. */
type NotionCandidate = {
  /** Its members, best first. Never empty — the step unlocks all of them. */
  tokens: readonly ChordToken[];
  /** The BEST member's windows, not the family's total. See below. */
  windows: number;
};

/** The notion's best member: what its windows are, and its tie-break. */
const leader = (notion: NotionCandidate): ChordToken => {
  const first = notion.tokens[0];
  if (first === undefined) throw new Error("a notion holds at least one chord");
  return first;
};

/**
 * The best candidate NOTION of each OPEN stage. A chord already unlocked, or
 * one no pool holds (an inversion whose root-position twin is unknown), is not
 * a step. Ties inside a stage go to the earlier token.
 *
 * A notion's members are ordered by windows descending, then token ascending,
 * so the same counts always give the same step.
 *
 * **Its `windows` is its best member's, not the sum.** Summing would count one
 * window once per member that opens it, and counting the set exactly would cost
 * one more `countLoopsInSet` query per notion on every `next` read. The ranking
 * does not need it: the biggest member is what decides whether the family earns
 * a level, and the step opens AT LEAST that many.
 */
function bestNotionPerStage(
  candidates: readonly ChordCandidate[],
  unlocked: ReadonlySet<ChordToken>,
  modes: ReadonlySet<HookpadMode>,
): Map<StageId, NotionCandidate> {
  // (stage, notion) → the candidates that are that one idea.
  const groups = new Map<
    string,
    { stage: StageId; members: ChordCandidate[] }
  >();
  for (const candidate of candidates) {
    if (unlocked.has(candidate.token)) continue;
    const stageId = stageOf(candidate.token, unlocked);
    if (stageId === null) continue;
    const stage = stageById(stageId);
    if (!stageIsOpen(stage, unlocked, modes)) continue;
    const notion = stage.notion(parseChordToken(candidate.token));
    const key = `${stageId}\u0000${notion}`;
    const group = groups.get(key);
    if (group === undefined) {
      groups.set(key, { stage: stageId, members: [candidate] });
    } else {
      group.members.push(candidate);
    }
  }

  const best = new Map<StageId, NotionCandidate>();
  for (const { stage, members } of groups.values()) {
    const ordered = [...members].sort(
      (a, b) => b.windows - a.windows || a.token.localeCompare(b.token),
    );
    const top = ordered[0];
    if (top === undefined) throw new Error("a notion holds at least one chord");
    const notion: NotionCandidate = {
      tokens: ordered.map((member) => member.token),
      windows: top.windows,
    };
    const current = best.get(stage);
    const better =
      current === undefined ||
      notion.windows > current.windows ||
      (notion.windows === current.windows && leader(notion) < leader(current));
    if (better) best.set(stage, notion);
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
