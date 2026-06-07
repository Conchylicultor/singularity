import type { ToolRendererProps } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/core";
import { ToolCallCard } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { Badge } from "@plugins/primitives/plugins/badge/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { jsonlEventsResource } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/core";
import { isInterruptContent } from "@plugins/conversations/plugins/transcript-watcher/core";
import { ANSWER_MARKER } from "../../shared";
import { AnswerForm } from "./answer-form";
import { findAnswerTurn } from "./awaiting";

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

interface AskUserQuestionInput {
  questions: Question[];
}

const KNOWN_PREFIXES = [
  'Your questions have been answered: ',
  'User has answered your questions: ',
];
const KNOWN_SUFFIXES = [
  '. You can now continue with these answers in mind.',
  '. You can now continue with the user\'s answers in mind.',
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

interface ParsedAnswer {
  /** Answer value for option matching, or null when no option was selected. */
  answer: string | null;
  /** Free-form note the user attached to this question, if any. */
  notes: string | null;
}

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

function parseAnswerMap(
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
 * ParsedAnswer>` shape `parseAnswerMap` returns, so the existing answered-view
 * JSX and `parseSelectedLabels` consume it unchanged.
 *
 * The turn body is a list of `- <header>: <value>` lines keyed by question
 * header, so we match each question on its `header` (not its `question` text).
 */
function parseMarkerAnswer(
  text: string,
  questions: Question[],
): Record<string, ParsedAnswer> {
  const body = text.trim().slice(ANSWER_MARKER.length);

  const byHeader: Record<string, string> = {};
  for (const rawLine of body.split("\n")) {
    const line = rawLine.trim();
    if (!line.startsWith("- ")) continue;
    const rest = line.slice(2);
    const sep = rest.indexOf(": ");
    if (sep === -1) continue;
    const header = rest.slice(0, sep).trim();
    const value = rest.slice(sep + 2).trim();
    byHeader[header] = value;
  }

  const answers: Record<string, ParsedAnswer> = {};
  for (const q of questions) {
    const value = byHeader[q.header];
    answers[q.question] = { answer: value ?? null, notes: null };
  }
  return answers;
}

function parseSelectedLabels(
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

export function Indicator({
  selected,
  multi,
}: {
  selected: boolean;
  multi: boolean;
}) {
  const shape = multi ? "rounded-sm" : "rounded-full";
  if (!selected) {
    return (
      <span
        className={`mt-0.5 shrink-0 size-3 border border-muted-foreground/40 ${shape}`}
      />
    );
  }
  return (
    <span
      className={`mt-0.5 shrink-0 size-3 border border-primary bg-primary flex items-center justify-center ${shape}`}
    >
      {multi ? (
        <span className="text-[8px] leading-none text-white">✓</span>
      ) : (
        <span className="block size-1 rounded-full bg-white" />
      )}
    </span>
  );
}

function summaryFor(questions: Question[], firstAnswerParts: string[]) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      {questions.length > 0 ? (
        questions.map((q, i) => (
          <Badge key={i} size="sm" colorClass="bg-info/15 text-info" className="shrink-0 font-mono">
            {q.header}
          </Badge>
        ))
      ) : (
        <Badge size="sm" colorClass="bg-info/15 text-info" className="shrink-0 font-mono">
          question
        </Badge>
      )}
      {questions[0]?.question && (
        <span className="min-w-0 truncate text-muted-foreground">
          {questions[0].question}
        </span>
      )}
      {firstAnswerParts.length > 0 && (
        <>
          <span className="shrink-0 text-muted-foreground/50">&rarr;</span>
          <span className="min-w-0 truncate text-foreground">
            {firstAnswerParts.join(", ")}
          </span>
        </>
      )}
    </span>
  );
}

export function AskUserQuestionToolView({ event }: ToolRendererProps) {
  const input = event.input as AskUserQuestionInput;
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard; input is `as`-cast from unknown
  const questions = Array.isArray(input?.questions) ? input.questions : [];

  const { convId } = conversationPane.useParams();
  const eventsResult = useResource(jsonlEventsResource, { id: convId });
  const events = eventsResult.pending ? undefined : eventsResult.data;
  // Find the last tool-call event (backwards loop; the repo's tsconfig target
  // predates Array.prototype.findLast — mirror the jsonl-pane precedent).
  let lastToolCall: NonNullable<typeof events>[number] | undefined;
  if (events) {
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i]?.kind === "tool-call") {
        lastToolCall = events[i];
        break;
      }
    }
  }

  // State machine derived from the JSONL event stream alone (no `waitingFor`).
  // When answered from the web, the tool is cancelled first, so its result is
  // the interrupt sentinel (not the answer); the real answer arrives later as a
  // separate `Answering your questions:` user turn.
  const resultIsInterrupt =
    event.result != null &&
    event.result.isError === true &&
    isInterruptContent(event.result.content);
  // The interrupt/rejection result is the cancel-to-flush answer mechanism, not a
  // failure — only style the card as an error for a genuine (non-interrupt) error.
  const showAsError = !resultIsInterrupt && (event.result?.isError ?? false);
  const isLastToolCall =
    lastToolCall?.kind === "tool-call" &&
    lastToolCall.toolUseId === event.toolUseId;
  const answerTurn = findAnswerTurn(events, event.toolUseId);

  // awaiting: cancelled (interrupt) + most recent question + no answer yet.
  if (resultIsInterrupt && isLastToolCall && answerTurn == null) {
    return (
      <ToolCallCard
        event={event}
        summary={summaryFor(questions, [])}
        defaultOpen
        isError={showAsError}
      >
        <AnswerForm
          questions={questions}
          convId={convId}
          toolUseId={event.toolUseId}
        />
      </ToolCallCard>
    );
  }

  // answerMap selection:
  // - new flow: a marker answer turn was found → parse it.
  // - legacy flow: result present, not an interrupt error → parse result.content.
  // - otherwise (result null pre-flush, or interrupted-but-not-last historical
  //   question with no answer turn): empty map → question rendered read-only.
  let answerMap: Record<string, ParsedAnswer> | null = null;
  if (answerTurn != null) {
    answerMap = parseMarkerAnswer(answerTurn, questions);
  } else if (event.result != null && !resultIsInterrupt && !event.result.isError) {
    answerMap = parseAnswerMap(event.result.content, questions);
  }

  const questionSelections = questions.map((q) => {
    const parsed = answerMap?.[q.question];
    const { selected, otherText } = parseSelectedLabels(
      parsed?.answer ?? undefined,
      q.options,
    );
    return { selected, otherText, notes: parsed?.notes ?? null };
  });

  const firstSel = questionSelections[0];
  const firstAnswerParts = firstSel
    ? [
        ...firstSel.selected,
        ...(firstSel.otherText ? [firstSel.otherText] : []),
        // Fall back to the note when the user attached one without picking an option.
        ...(firstSel.selected.size === 0 && !firstSel.otherText && firstSel.notes
          ? [firstSel.notes]
          : []),
      ]
    : [];

  const summary = summaryFor(questions, firstAnswerParts);

  return (
    <ToolCallCard
      event={event}
      summary={summary}
      defaultOpen
      isError={showAsError}
    >
      <div className="mt-2 space-y-3">
        {questions.map((q, qi) => {
          const { selected, otherText, notes } = questionSelections[qi] ?? {
            selected: new Set<string>(),
            otherText: null,
            notes: null,
          };
          const hasAnswer = selected.size > 0 || otherText != null;

          return (
            <div key={qi}>
              {questions.length > 1 && (
                <p className="mb-1 text-[10px] font-medium tracking-wider text-muted-foreground">
                  {q.header}
                </p>
              )}
              <p className="mb-1.5 text-xs text-foreground">{q.question}</p>
              <div className="space-y-1">
                {q.options.map((opt, oi) => {
                  const isSelected = selected.has(opt.label);
                  return (
                    <div
                      key={oi}
                      className={`flex gap-2 ${isSelected ? "rounded-md border-l-2 border-primary bg-primary/5 py-1 pl-2" : hasAnswer ? "pl-0.5 opacity-60" : "pl-0.5"}`}
                    >
                      <Indicator selected={isSelected} multi={q.multiSelect} />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium">{opt.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {opt.description}
                        </p>
                        {opt.preview && (
                          <pre className="mt-1 whitespace-pre-wrap break-words rounded bg-muted/60 p-1.5 font-mono text-[10px] text-muted-foreground">
                            {opt.preview}
                          </pre>
                        )}
                      </div>
                    </div>
                  );
                })}
                {otherText != null && (
                  <div className="flex gap-2 rounded-md border-l-2 border-primary bg-primary/5 py-1 pl-2">
                    <Indicator selected multi={q.multiSelect} />
                    <p className="text-xs italic text-foreground">
                      {otherText}
                    </p>
                  </div>
                )}
                {notes != null && (
                  <div className="rounded-md border-l-2 border-muted-foreground/30 bg-muted/40 py-1 pl-2">
                    <p className="text-[10px] font-medium tracking-wider text-muted-foreground">
                      Note
                    </p>
                    <p className="whitespace-pre-wrap break-words text-xs text-foreground">
                      {notes}
                    </p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {event.result?.isError && !resultIsInterrupt && (
          <p className="text-xs text-destructive">{event.result.content}</p>
        )}
      </div>
    </ToolCallCard>
  );
}
