import type { ToolRendererProps } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/core";
import { ToolCallCard } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import {
  CheckboxIndicator,
  RadioIndicator,
} from "@plugins/primitives/plugins/css/plugins/selection-indicator/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { jsonlEventsResource } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/core";
import { isInterruptContent } from "@plugins/conversations/plugins/transcript-watcher/core";
import { AnswerForm } from "./answer-form";
import { findAnswerTurn } from "./awaiting";
import {
  parseAnswerMap,
  parseMarkerAnswer,
  parseSelectedLabels,
  type AskUserQuestionInput,
  type ParsedAnswer,
  type Question,
} from "./answer-model";

export function Indicator({
  selected,
  multi,
}: {
  selected: boolean;
  multi: boolean;
}) {
  // A checkbox (multi) and a radio (single) are semantic fixed shapes that must
  // stay a square / circle under every Shape preset. The selection-indicator
  // primitive owns those fixed shapes, so this just picks the right one.
  return multi ? (
    // eslint-disable-next-line spacing/no-adhoc-spacing -- mt nudges the indicator to align with the first line of multi-line label text (no named margin utility)
    <CheckboxIndicator checked={selected} className="mt-0.5" />
  ) : (
    // eslint-disable-next-line spacing/no-adhoc-spacing -- mt nudges the indicator to align with the first line of multi-line label text (no named margin utility)
    <RadioIndicator checked={selected} className="mt-0.5" />
  );
}

function summaryFor(questions: Question[], firstAnswerParts: string[]) {
  return (
    <span className="flex min-w-0 items-center gap-xs">
      {questions.length > 0 ? (
        questions.map((q, i) => (
          <Badge key={i} colorClass="bg-info/15 text-info" className="shrink-0 font-mono">
            {q.header}
          </Badge>
        ))
      ) : (
        <Badge colorClass="bg-info/15 text-info" className="shrink-0 font-mono">
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

  if (eventsResult.pending) return null;

  const events = eventsResult.data;
  const lastToolCall = events.findLast((e) => e.kind === "tool-call");

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
      {/* eslint-disable-next-line spacing/no-adhoc-spacing -- mt offsets the answered view from the question card above (no named margin utility) */}
      <Stack gap="md" className="mt-2">
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
                <p
                  // eslint-disable-next-line spacing/no-adhoc-spacing -- mb separates the per-question header from its question text (no named margin utility)
                  className="mb-1 text-3xs font-medium tracking-wider text-muted-foreground"
                >
                  {q.header}
                </p>
              )}
              {/* eslint-disable-next-line spacing/no-adhoc-spacing -- mb separates the question text from its option list (no named margin utility) */}
              <Text as="p" variant="caption" className="mb-1.5 text-foreground">
                {q.question}
              </Text>
              <Stack gap="xs">
                {q.options.map((opt, oi) => {
                  const isSelected = selected.has(opt.label);
                  return (
                    <div
                      key={oi}
                      className={`flex gap-sm ${isSelected ? "rounded-md border-l-2 border-primary bg-primary/5 py-xs pl-sm" : hasAnswer ? "pl-2xs opacity-60" : "pl-2xs"}`}
                    >
                      <Indicator selected={isSelected} multi={q.multiSelect} />
                      <div className="min-w-0 flex-1">
                        <Text as="p" variant="caption" className="font-medium">
                          {opt.label}
                        </Text>
                        <Text as="p" variant="caption" tone="muted">
                          {opt.description}
                        </Text>
                        {opt.preview && (
                          <pre
                            // eslint-disable-next-line spacing/no-adhoc-spacing -- mt offsets the preview block from the option description above (no named margin utility)
                            className="mt-1 whitespace-pre-wrap break-words rounded-md bg-muted/60 p-xs font-mono text-3xs text-muted-foreground"
                          >
                            {opt.preview}
                          </pre>
                        )}
                      </div>
                    </div>
                  );
                })}
                {otherText != null && (
                  <div className="flex gap-sm rounded-md border-l-2 border-primary bg-primary/5 py-xs pl-sm">
                    <Indicator selected multi={q.multiSelect} />
                    <Text as="p" variant="caption" className="italic text-foreground">
                      {otherText}
                    </Text>
                  </div>
                )}
                {notes != null && (
                  <div className="rounded-md border-l-2 border-muted-foreground/30 bg-muted/40 py-xs pl-sm">
                    <p className="text-3xs font-medium tracking-wider text-muted-foreground">
                      Note
                    </p>
                    <Text
                      as="p"
                      variant="caption"
                      className="whitespace-pre-wrap break-words text-foreground"
                    >
                      {notes}
                    </Text>
                  </div>
                )}
              </Stack>
            </div>
          );
        })}
        {event.result?.isError && !resultIsInterrupt && (
          <Text as="p" variant="caption" tone="destructive">
            {event.result.content}
          </Text>
        )}
      </Stack>
    </ToolCallCard>
  );
}
