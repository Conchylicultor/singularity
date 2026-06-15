import { ANSWER_MARKER } from "../../shared";

/**
 * Pure, React-free model for the AskUserQuestion tool: the question/answer
 * shapes plus the parsers that turn the harness's textual answer turns back into
 * structured selections. Kept separate from the rendering component so the
 * parsing contract is unit-testable without pulling in the web dependency tree.
 */

export interface QuestionOption {
  label: string;
  description: string;
  preview?: string;
}

export interface Question {
  question: string;
  header: string;
  options: QuestionOption[];
  multiSelect: boolean;
}

export interface AskUserQuestionInput {
  questions: Question[];
}

export interface ParsedAnswer {
  /** Answer value for option matching, or null when no option was selected. */
  answer: string | null;
  /** Free-form note the user attached to this question, if any. */
  notes: string | null;
}

const KNOWN_PREFIXES = [
  "Your questions have been answered: ",
  "User has answered your questions: ",
];
const KNOWN_SUFFIXES = [
  ". You can now continue with these answers in mind.",
  ". You can now continue with the user's answers in mind.",
];

function extractPayload(content: string): string {
  for (const prefix of KNOWN_PREFIXES) {
    const pi = content.indexOf(prefix);
    if (pi === -1) continue;
    for (const suffix of KNOWN_SUFFIXES) {
      const si = content.lastIndexOf(suffix);
      if (si !== -1 && si > pi) return content.slice(pi + prefix.length, si);
    }
    return content.slice(pi + prefix.length);
  }
  return content;
}

// Sentinel the harness emits when the user submitted a note but picked no option.
const NO_SELECTION = "(no option selected)";
// Annotation markers the harness appends after the answer value. ` selected` is
// a trailing word stamped after a quoted option that carried a preview.
const NOTES_MARK = " notes: ";
const PREVIEW_MARK = " preview:";
const SELECTED_MARK = " selected";

/**
 * Splits a per-question result value into its answer portion and the optional
 * `notes:`/`preview:` annotations the harness appends. Preview text is rendered
 * from the tool input, so it is only used here to bound the answer and notes.
 */
function splitAnnotations(value: string): { answer: string; notes: string | null } {
  const notesIdx = value.indexOf(NOTES_MARK);
  const previewIdx = value.indexOf(PREVIEW_MARK);
  const marks = [notesIdx, previewIdx].filter((i) => i >= 0);
  const answerEnd = marks.length > 0 ? Math.min(...marks) : value.length;
  const answer = value.slice(0, answerEnd).trim();

  let notes: string | null = null;
  if (notesIdx >= 0) {
    const start = notesIdx + NOTES_MARK.length;
    // The note runs until the next annotation marker (a later preview) or the end.
    const notesEnd = previewIdx > notesIdx ? previewIdx : value.length;
    notes = value.slice(start, notesEnd).trim() || null;
  }

  return { answer, notes };
}

/** Strips the trailing ` selected` word, the no-selection sentinel, and quotes. */
function cleanAnswerPortion(answer: string): string | null {
  let a = answer.trim();
  if (a.endsWith(SELECTED_MARK)) a = a.slice(0, -SELECTED_MARK.length).trim();
  if (a === "" || a === NO_SELECTION) return null;
  if (a.length >= 2 && a.startsWith('"') && a.endsWith('"')) a = a.slice(1, -1);
  return a;
}

/**
 * Legacy flow: the tool result content directly carries the answers as
 * `"<question>"=<value>` pairs. Anchors on each question text to slice values.
 */
export function parseAnswerMap(
  content: string,
  questions: Question[],
): Record<string, ParsedAnswer> {
  const payload = extractPayload(content);

  const answers: Record<string, ParsedAnswer> = {};
  const anchors: { question: string; anchorStart: number; valueStart: number }[] =
    [];

  for (const q of questions) {
    // Anchor on `"<question>"=` only — the value may be a quoted option or the
    // `(no option selected)` sentinel, so we must not require a leading quote.
    const anchor = `"${q.question}"=`;
    const idx = payload.indexOf(anchor);
    if (idx !== -1) {
      anchors.push({
        question: q.question,
        anchorStart: idx,
        valueStart: idx + anchor.length,
      });
    }
  }

  anchors.sort((a, b) => a.valueStart - b.valueStart);

  for (let i = 0; i < anchors.length; i++) {
    const cur = anchors[i]!;
    const next = anchors[i + 1];
    // Each value runs up to the next question's anchor; the `, ` separator only
    // exists between questions, so strip it for non-final entries only.
    const value =
      next != null
        ? payload.slice(cur.valueStart, next.anchorStart).replace(/,\s*$/, "")
        : payload.slice(cur.valueStart);
    const { answer, notes } = splitAnnotations(value);
    answers[cur.question] = { answer: cleanAnswerPortion(answer), notes };
  }

  return answers;
}

/**
 * Parses the follow-up answer turn (the `Answering your questions:` message
 * produced by `serializeAnswers`) into the same `Record<questionText,
 * ParsedAnswer>` shape `parseAnswerMap` returns, so the answered-view JSX and
 * `parseSelectedLabels` consume it unchanged.
 *
 * The turn body is a list of `- <header>: <value>` lines, one per question in
 * the same order `serializeAnswers` emits them. We must NOT split each line on
 * its first `": "`: a question `header` can itself contain `": "` (e.g.
 * `"Scope: CLI fix"`), which would mis-key the value and drop the answer.
 * Instead we strip the exact, authoritative `"<header>: "` prefix — positionally
 * per question, so duplicate headers are also handled — leaving the delimiter
 * ambiguity irrelevant.
 */
export function parseMarkerAnswer(
  text: string,
  questions: Question[],
): Record<string, ParsedAnswer> {
  const body = text.trim().slice(ANSWER_MARKER.length);

  const lines = body
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("- "))
    .map((l) => l.slice(2));

  const answers: Record<string, ParsedAnswer> = {};
  questions.forEach((q, i) => {
    const prefix = `${q.header}: `;
    const line = lines[i];
    const value =
      line != null && line.startsWith(prefix)
        ? line.slice(prefix.length).trim() || null
        : null;
    answers[q.question] = { answer: value, notes: null };
  });
  return answers;
}

export function parseSelectedLabels(
  answer: string | undefined,
  options: QuestionOption[],
): { selected: Set<string>; otherText: string | null } {
  if (answer == null) return { selected: new Set(), otherText: null };

  if (options.some((o) => o.label === answer)) {
    return { selected: new Set([answer]), otherText: null };
  }

  const parts = answer.split(", ");
  const labelSet = new Set(options.map((o) => o.label));
  const matched = new Set<string>();
  const unmatched: string[] = [];

  for (const part of parts) {
    if (labelSet.has(part)) matched.add(part);
    else unmatched.push(part);
  }

  if (matched.size > 0) {
    return {
      selected: matched,
      otherText: unmatched.length > 0 ? unmatched.join(", ") : null,
    };
  }

  return { selected: new Set(), otherText: answer };
}
