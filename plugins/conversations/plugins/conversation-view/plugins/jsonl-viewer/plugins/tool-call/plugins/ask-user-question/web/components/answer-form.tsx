import { Button, Input } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import { useDraft } from "@plugins/primitives/plugins/persistent-draft/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Frame } from "@plugins/primitives/plugins/css/plugins/frame/web";
import { toast } from "@plugins/shell/plugins/notifications/web";
import { answerAskUserQuestion, ANSWER_MARKER } from "../../shared";
import { Indicator } from "./ask-user-question-tool-view";
import { type Question } from "./answer-model";

// Persisted shape: `selected` is a string[] (not a Set) so the draft survives a
// JSON round-trip through localStorage via useDraft. `otherText` is a buffer
// that is ALWAYS preserved — selecting a preset never clears it. For
// single-select questions, `otherActive` is the pointer that says which of the
// two buffers (a preset in `selected`, or `otherText`) is the live answer, so
// the user can flip between a preset and their typed text without losing
// either. Multi-select ignores `otherActive`: there the freeform is additive.
interface QuestionAnswer {
  selected: string[];
  otherText: string;
  otherActive: boolean;
}

// Is the freeform "Other" row the active choice? Multi-select: active whenever
// there is text (it's additive). Single-select: only when the pointer says so.
function isOtherActive(answer: QuestionAnswer, question: Question): boolean {
  return question.multiSelect
    ? answer.otherText.trim().length > 0
    : answer.otherActive;
}

// Is a given preset option the active choice? Single-select hides the preset
// highlight while "Other" is active, even though the preset is still buffered.
function isOptionActive(
  answer: QuestionAnswer,
  question: Question,
  label: string,
): boolean {
  if (!answer.selected.includes(label)) return false;
  return question.multiSelect ? true : !answer.otherActive;
}

function isAnswered(answer: QuestionAnswer, question: Question): boolean {
  // Multi-select (checkbox) questions accept zero selections as a valid
  // answer ("none of these"); only single-select requires a choice.
  if (question.multiSelect) return true;
  return answer.otherActive
    ? answer.otherText.trim().length > 0
    : answer.selected.length > 0;
}

function serializeAnswers(
  questions: Question[],
  answers: QuestionAnswer[],
): string {
  const lines = questions.map((q, qi) => {
    const answer = answers[qi]!;
    const trimmed = answer.otherText.trim();
    let parts: string[];
    if (q.multiSelect) {
      // Additive: every selected preset, plus the freeform if present.
      parts = [...answer.selected];
      if (trimmed.length > 0) parts.push(trimmed);
    } else {
      // Single-select: emit only the active choice; the inactive buffer is a
      // draft convenience, not part of the answer.
      parts = answer.otherActive
        ? trimmed.length > 0
          ? [trimmed]
          : []
        : [...answer.selected];
    }
    return `- ${q.header}: ${parts.join(", ")}`;
  });
  return `${ANSWER_MARKER}\n\n${lines.join("\n")}`;
}

export function AnswerForm({
  questions,
  convId,
  toolUseId,
}: {
  questions: Question[];
  convId: string;
  toolUseId: string;
}) {
  // Persist the in-progress answer like the prompt draft. Scoping by the
  // tool-use id (unique per question) means a restored draft always belongs to
  // the exact question still on screen, and never collides with another
  // question in the same conversation.
  const [answers, setAnswers, clearDraft] = useDraft<QuestionAnswer[]>(
    "ask-user-question:answer",
    () =>
      questions.map(() => ({ selected: [], otherText: "", otherActive: false })),
    { scope: `${convId}:${toolUseId}` },
  );

  const updateAnswer = (qi: number, next: QuestionAnswer) => {
    setAnswers((prev) => prev.map((a, i) => (i === qi ? next : a)));
  };

  const toggleOption = (qi: number, label: string, multiSelect: boolean) => {
    const current = answers[qi]!;
    if (multiSelect) {
      const selected = current.selected.includes(label)
        ? current.selected.filter((l) => l !== label)
        : [...current.selected, label];
      updateAnswer(qi, { ...current, selected });
    } else {
      // Single-select: this preset becomes the active choice. The freeform
      // buffer is preserved (shown inactive) so switching back doesn't lose it.
      updateAnswer(qi, { ...current, selected: [label], otherActive: false });
    }
  };

  const setOtherText = (qi: number, value: string, multiSelect: boolean) => {
    const current = answers[qi]!;
    if (multiSelect) {
      // Multi-select: "Other" is additive to any selected options.
      updateAnswer(qi, { ...current, otherText: value });
    } else {
      // Single-select: typing makes "Other" the active choice while the
      // previously selected preset stays buffered (inactive) for switch-back.
      updateAnswer(qi, { ...current, otherText: value, otherActive: true });
    }
  };

  const focusOther = (qi: number, multiSelect: boolean) => {
    if (multiSelect) return;
    const current = answers[qi]!;
    if (current.otherActive) return;
    // Focusing the freeform field signals intent to use it: make it the active
    // choice (dimming any selected preset). The preset stays buffered so a
    // click on it restores it without retyping.
    updateAnswer(qi, { ...current, otherActive: true });
  };

  const m = useEndpointMutation(answerAskUserQuestion, {
    onSuccess: () => clearDraft(),
    onError: (err) =>
      toast({
        type: "conversation",
        title: "Answer failed",
        description: err.message,
        variant: "error",
      }),
  });

  const allAnswered = answers.every((a, qi) => isAnswered(a, questions[qi]!));
  const canSubmit = allAnswered && !m.isPending;

  const handleSubmit = () => {
    const text = serializeAnswers(questions, answers);
    m.mutate({ params: { id: convId }, body: { text } });
  };

  // Enter submits once every question is answered, from anywhere in the form
  // (option buttons, the "Other" input, or no focus). Shift+Enter is left alone.
  // While the form is incomplete, Enter falls through so a focused option button
  // still toggles via its own activation.
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && canSubmit) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    // eslint-disable-next-line spacing/no-adhoc-spacing -- mt offsets the answer form from the question card above (no named margin utility)
    <Stack gap="md" className="mt-2" onKeyDown={handleKeyDown}>
      {questions.map((q, qi) => {
        const answer = answers[qi]!;
        const otherActive = isOtherActive(answer, q);
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
                const isSelected = isOptionActive(answer, q, opt.label);
                return (
                  <button
                    key={oi}
                    type="button"
                    onClick={() =>
                      toggleOption(qi, opt.label, q.multiSelect)
                    }
                    className={`w-full text-left transition-colors ${
                      isSelected
                        ? "rounded-md border-l-2 border-primary bg-primary/5 py-xs pl-sm"
                        : "rounded-md py-xs pl-2xs hover:bg-muted/50"
                    }`}
                  >
                    <Frame
                      gap="sm"
                      align="start"
                      leading={
                        <Indicator selected={isSelected} multi={q.multiSelect} />
                      }
                      content={
                        <div className="select-text">
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
                      }
                    />
                  </button>
                );
              })}
              <Frame
                gap="sm"
                className={
                  otherActive
                    ? "rounded-md border-l-2 border-primary bg-primary/5 py-xs pl-sm"
                    : "pl-2xs"
                }
                leading={
                  <Indicator selected={otherActive} multi={q.multiSelect} />
                }
                meta={
                  <Input
                    value={answer.otherText}
                    onChange={(e) =>
                      setOtherText(qi, e.target.value, q.multiSelect)
                    }
                    onFocus={() => focusOther(qi, q.multiSelect)}
                    placeholder="Other…"
                    className="text-caption h-7"
                  />
                }
              />
            </Stack>
          </div>
        );
      })}
      <Stack direction="row" gap="none" justify="end">
        <Button
          loading={m.isPending}
          disabled={!allAnswered}
          onClick={handleSubmit}
        >
          Submit
        </Button>
      </Stack>
    </Stack>
  );
}
