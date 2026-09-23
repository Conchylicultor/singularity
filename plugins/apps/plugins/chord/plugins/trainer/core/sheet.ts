import type { ChordToken } from "@plugins/apps/plugins/chord/plugins/song-index/core";
import type { RecordRoundBody } from "@plugins/apps/plugins/chord/plugins/progress/core";
import type { Blanks } from "@plugins/apps/plugins/chord/plugins/curriculum/core";
import { clampAnswerMs } from "./answer-time";
import type { Round } from "./round";

// ── The answer sheet: what the learner has filled in so far ─────────────────
//
// Pure, so the rules of a round (plan "How a round works", step 4–6) are
// stated once and tested without a browser:
//
// - a round asks for SOME of its boxes; the rest are given, already showing
//   their chord, and the learner never touches them;
// - the first asked box starts selected;
// - a fill writes the selected box and moves to the next empty box after it
//   (else the first empty one anywhere); the last fill checks the sheet;
// - ← / → move the selection, stepping over the given boxes; a click selects
//   an asked box;
// - Backspace clears the selected box, or the asked one before it when it is
//   empty;
// - once checked, the sheet no longer changes.
//
// Which boxes are asked is the curriculum's decision, made outside: early on
// only the box holding the chord being practised, later the whole loop.

export type AnswerSheet = {
  /** One per box, in playing order: the chord picked (or the given chord), or null while empty. */
  answers: readonly (ChordToken | null)[];
  /** How long each box's LAST fill took, in ms (already clamped), or null. A given box has none. */
  answerMs: readonly (number | null)[];
  /** One per box: true where the learner must name the chord, false where it was given. */
  asked: readonly boolean[];
  /** The box a chord button fills — always an asked one; `null` once checked. */
  selected: number | null;
  /** Every ASKED box is filled and the answers are marked. */
  checked: boolean;
};

/**
 * A fresh sheet for `round`, asking for the boxes at the positions in `asked`.
 * The other boxes come already filled with their own chord, and stay that way:
 * they cannot be selected, cleared or refilled. The first asked box is selected.
 *
 * Throws on an `asked` set that is empty, repeats a box, or names one the round
 * does not have — a round nobody is asked to answer is a programming error, not
 * a state to render.
 */
export function emptySheet(
  round: Round,
  asked: readonly number[],
): AnswerSheet {
  const boxCount = round.boxes.length;
  if (asked.length === 0) {
    throw new Error(
      `A round asks for at least one box, got none of the ${boxCount}`,
    );
  }
  const isAsked = Array.from({ length: boxCount }, () => false);
  for (const position of asked) {
    if (!(Number.isInteger(position) && position >= 0 && position < boxCount)) {
      throw new Error(
        `Box ${position} does not exist: the round has ${boxCount}`,
      );
    }
    if (isAsked[position] === true) {
      throw new Error(`Box ${position} is asked for twice`);
    }
    isAsked[position] = true;
  }
  return {
    answers: round.boxes.map((box, i) =>
      isAsked[i] === true ? null : box.token,
    ),
    answerMs: Array.from({ length: boxCount }, () => null),
    asked: isAsked,
    selected: isAsked.findIndex((a) => a),
    checked: false,
  };
}

/**
 * Fill the selected box with `token`, `elapsedMs` after its chord first
 * finished sounding (clamped to the answer-time bounds, and rounded: the
 * server takes whole ms). A no-op once checked.
 *
 * The next selection is the next empty box, which is always an asked one: a
 * given box is filled from the start, so it is never empty.
 */
export function fillSelected(
  sheet: AnswerSheet,
  token: ChordToken,
  elapsedMs: number,
): AnswerSheet {
  if (sheet.checked || sheet.selected === null) return sheet;
  const at = sheet.selected;
  const answers = sheet.answers.slice();
  const answerMs = sheet.answerMs.slice();
  answers[at] = token;
  answerMs[at] = Math.round(clampAnswerMs(elapsedMs));

  const after = answers.findIndex((a, i) => a === null && i > at);
  const anywhere = answers.findIndex((a) => a === null);
  if (anywhere === -1) {
    return { ...sheet, answers, answerMs, selected: null, checked: true };
  }
  return {
    ...sheet,
    answers,
    answerMs,
    selected: after !== -1 ? after : anywhere,
    checked: false,
  };
}

/**
 * Select box `position`. A no-op once checked, and on a given box, which is not
 * a click target. Throws on a box that does not exist.
 */
export function selectBox(sheet: AnswerSheet, position: number): AnswerSheet {
  if (sheet.checked) return sheet;
  assertPosition(sheet, position);
  if (sheet.asked[position] !== true) return sheet;
  return sheet.selected === position ? sheet : { ...sheet, selected: position };
}

/**
 * Move the selection one asked box left (-1) or right (+1), stepping over the
 * given ones and stopping at the last asked box in that direction.
 */
export function moveSelection(sheet: AnswerSheet, delta: -1 | 1): AnswerSheet {
  if (sheet.checked || sheet.selected === null) return sheet;
  const next = askedNeighbour(sheet, sheet.selected, delta);
  return next === null ? sheet : { ...sheet, selected: next };
}

/**
 * Backspace: clear the selected box, or — when it is already empty — the asked
 * box before it, which becomes selected. A given box is never cleared. A no-op
 * once checked.
 */
export function clearBackward(sheet: AnswerSheet): AnswerSheet {
  if (sheet.checked || sheet.selected === null) return sheet;
  const before = askedNeighbour(sheet, sheet.selected, -1);
  const at =
    sheet.answers[sheet.selected] !== null
      ? sheet.selected
      : (before ?? sheet.selected);
  if (sheet.answers[at] === null) {
    return at === sheet.selected ? sheet : { ...sheet, selected: at };
  }
  const answers = sheet.answers.slice();
  const answerMs = sheet.answerMs.slice();
  answers[at] = null;
  answerMs[at] = null;
  return { ...sheet, answers, answerMs, selected: at, checked: false };
}

/** The score of a checked sheet: right answers, ASKED boxes, and the total answer time. */
export type SheetScore = { right: number; total: number; totalMs: number };

export function sheetScore(sheet: AnswerSheet, round: Round): SheetScore {
  const answers = checkedAnswers(sheet, round);
  return {
    right: answers.filter((a) => a.answer === a.token).length,
    total: answers.length,
    totalMs: answers.reduce((sum, a) => sum + a.answerMs, 0),
  };
}

/**
 * The body of `POST /api/chord/rounds` for a checked sheet: one answer per
 * ASKED box, how many boxes were given, and the blanks setting the asked boxes
 * were chosen by. Throws on a sheet not checked.
 */
export function recordRoundBody(
  sheet: AnswerSheet,
  round: Round,
  blanks: Blanks,
): RecordRoundBody {
  const answers = checkedAnswers(sheet, round);
  return {
    sectionId: round.sectionId,
    videoId: round.videoId,
    shape: round.shape,
    startBeat: round.startBeat,
    answers,
    givenCount: round.boxes.length - answers.length,
    blanks,
  };
}

function checkedAnswers(
  sheet: AnswerSheet,
  round: Round,
): RecordRoundBody["answers"] {
  if (!sheet.checked) {
    throw new Error("The sheet is not checked yet: some boxes are empty");
  }
  if (sheet.answers.length !== round.boxes.length) {
    throw new Error(
      `The sheet has ${sheet.answers.length} boxes, the round ${round.boxes.length}`,
    );
  }
  return round.boxes
    .filter((box) => sheet.asked[box.position] === true)
    .map((box) => {
      const answer = sheet.answers[box.position];
      const answerMs = sheet.answerMs[box.position];
      if (answer === null || answer === undefined) {
        throw new Error(`Box ${box.position} of a checked sheet has no answer`);
      }
      if (answerMs === null || answerMs === undefined) {
        throw new Error(`Box ${box.position} of a checked sheet has no time`);
      }
      return { position: box.position, token: box.token, answer, answerMs };
    });
}

/** The nearest asked box in that direction, or null when there is none. */
function askedNeighbour(
  sheet: AnswerSheet,
  from: number,
  delta: -1 | 1,
): number | null {
  for (let i = from + delta; i >= 0 && i < sheet.asked.length; i += delta) {
    if (sheet.asked[i] === true) return i;
  }
  return null;
}

function assertPosition(sheet: AnswerSheet, position: number): void {
  if (
    !(Number.isInteger(position) && position >= 0) ||
    position >= sheet.answers.length
  ) {
    throw new Error(
      `Box ${position} does not exist: the round has ${sheet.answers.length}`,
    );
  }
}
