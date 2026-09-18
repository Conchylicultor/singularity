import type { ChordToken } from "@plugins/apps/plugins/chord/plugins/song-index/core";
import type { RecordRoundBody } from "@plugins/apps/plugins/chord/plugins/progress/core";
import { clampAnswerMs } from "./answer-time";
import type { Round } from "./round";

// ── The answer sheet: what the learner has filled in so far ─────────────────
//
// Pure, so the rules of a round (plan "How a round works", step 4–6) are
// stated once and tested without a browser:
//
// - the first empty box starts selected;
// - a fill writes the selected box and moves to the next empty box after it
//   (else the first empty one anywhere); the last fill checks the sheet;
// - ← / → move the selection; a click selects a box;
// - Backspace clears the selected box, or the one before it when it is empty;
// - once checked, the sheet no longer changes.

export type AnswerSheet = {
  /** One per box, in playing order: the chord picked, or null while empty. */
  answers: readonly (ChordToken | null)[];
  /** How long each box's LAST fill took, in ms (already clamped), or null while empty. */
  answerMs: readonly (number | null)[];
  /** The box a chord button fills; `null` once checked. */
  selected: number | null;
  /** Every box is filled and the answers are marked. */
  checked: boolean;
};

/** A fresh sheet for a round of `boxCount` boxes, the first one selected. */
export function emptySheet(boxCount: number): AnswerSheet {
  if (!(Number.isInteger(boxCount) && boxCount > 0)) {
    throw new Error(`A round has at least one box, got ${boxCount}`);
  }
  return {
    answers: Array.from({ length: boxCount }, () => null),
    answerMs: Array.from({ length: boxCount }, () => null),
    selected: 0,
    checked: false,
  };
}

/**
 * Fill the selected box with `token`, `elapsedMs` after its chord first
 * finished sounding (clamped to the answer-time bounds, and rounded: the
 * server takes whole ms). A no-op once checked.
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
    return { answers, answerMs, selected: null, checked: true };
  }
  return {
    answers,
    answerMs,
    selected: after !== -1 ? after : anywhere,
    checked: false,
  };
}

/** Select box `position`. A no-op once checked; throws on a box that does not exist. */
export function selectBox(sheet: AnswerSheet, position: number): AnswerSheet {
  if (sheet.checked) return sheet;
  assertPosition(sheet, position);
  return sheet.selected === position ? sheet : { ...sheet, selected: position };
}

/** Move the selection one box left (-1) or right (+1), stopping at the ends. */
export function moveSelection(sheet: AnswerSheet, delta: -1 | 1): AnswerSheet {
  if (sheet.checked || sheet.selected === null) return sheet;
  const next = Math.min(
    sheet.answers.length - 1,
    Math.max(0, sheet.selected + delta),
  );
  return next === sheet.selected ? sheet : { ...sheet, selected: next };
}

/**
 * Backspace: clear the selected box, or — when it is already empty — the box
 * before it, which becomes selected. A no-op once checked.
 */
export function clearBackward(sheet: AnswerSheet): AnswerSheet {
  if (sheet.checked || sheet.selected === null) return sheet;
  const at =
    sheet.answers[sheet.selected] !== null
      ? sheet.selected
      : Math.max(0, sheet.selected - 1);
  if (sheet.answers[at] === null) {
    return at === sheet.selected ? sheet : { ...sheet, selected: at };
  }
  const answers = sheet.answers.slice();
  const answerMs = sheet.answerMs.slice();
  answers[at] = null;
  answerMs[at] = null;
  return { answers, answerMs, selected: at, checked: false };
}

/** The score of a checked sheet: right answers, boxes, and the total answer time. */
export type SheetScore = { right: number; total: number; totalMs: number };

export function sheetScore(sheet: AnswerSheet, round: Round): SheetScore {
  const answers = checkedAnswers(sheet, round);
  return {
    right: answers.filter((a) => a.answer === a.token).length,
    total: answers.length,
    totalMs: answers.reduce((sum, a) => sum + a.answerMs, 0),
  };
}

/** The body of `POST /api/chord/rounds` for a checked sheet. Throws on one not checked. */
export function recordRoundBody(
  sheet: AnswerSheet,
  round: Round,
): RecordRoundBody {
  return {
    sectionId: round.sectionId,
    videoId: round.videoId,
    shape: round.shape,
    startBeat: round.startBeat,
    answers: checkedAnswers(sheet, round),
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
  return round.boxes.map((box) => {
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
