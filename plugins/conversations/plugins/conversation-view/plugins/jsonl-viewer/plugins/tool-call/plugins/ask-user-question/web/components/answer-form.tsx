import type { ReactNode } from "react";
import {
  Button,
  ControlSizeProvider,
  Input,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useDraft } from "@plugins/primitives/plugins/persistent-draft/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { OptionBody, OptionRow } from "./option-row";
import {
  type AnswerSelections,
  type Question,
  type QuestionSelection,
} from "./answer-model";
import {
  ANSWER_DRAFT_KEY,
  emptyAnswers,
  type QuestionAnswer,
} from "./answer-draft";

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

/**
 * The form state as the answer it stands for, one selection per question
 * text. Single-select keeps only the ACTIVE buffer (a preset, or the typed
 * text) — the inactive one is a draft convenience, not part of the answer.
 * Multi-select is additive: every picked preset plus any typed text.
 */
function selectionsOf(
  questions: Question[],
  answers: QuestionAnswer[],
): AnswerSelections {
  const selections: AnswerSelections = {};
  questions.forEach((q, qi) => {
    const answer = answers[qi]!;
    const typed = answer.otherText.trim() || null;
    const selection: QuestionSelection =
      q.multiSelect || !answer.otherActive
        ? {
            selected: [...answer.selected],
            other: q.multiSelect ? typed : null,
          }
        : { selected: [], other: typed };
    selections[q.question] = selection;
  });
  return selections;
}

/**
 * The interactive answer form for one AskUserQuestion call — presentational:
 * it owns the in-progress draft and hands the finished answer to `onSubmit`,
 * which decides how it reaches the agent (a relay answer, or the legacy
 * pasted turn — see marker-answer-form.tsx). `onSubmit` says whether the
 * answer was accepted; only then is the draft cleared, so a failed send keeps
 * what the user picked.
 */
export function AnswerForm({
  questions,
  draftScope,
  onSubmit,
  secondaryAction,
}: {
  questions: Question[];
  /** Scopes the persisted draft — `answerDraftScope(convId, toolUseId)`. */
  draftScope: string;
  onSubmit: (selections: AnswerSelections) => boolean | Promise<boolean>;
  /** A secondary action shown beside Submit. */
  secondaryAction?: ReactNode;
}) {
  // Persist the in-progress answer like the prompt draft (see answer-draft.ts
  // for the scope). A rewind from the answered card writes this same draft, so
  // the reopened form starts from the previous answer.
  const [answers, setAnswers, clearDraft] = useDraft<QuestionAnswer[]>(
    ANSWER_DRAFT_KEY,
    () => emptyAnswers(questions),
    { scope: draftScope },
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

  const canSubmit = answers.every((a, qi) => isAnswered(a, questions[qi]!));

  const handleSubmit = async () => {
    if (await onSubmit(selectionsOf(questions, answers))) clearDraft();
  };

  // Enter submits once every question is answered, from anywhere in the form
  // (option buttons, the "Other" input, or no focus). Shift+Enter is left alone.
  // While the form is incomplete, Enter falls through so a focused option button
  // still toggles via its own activation.
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && canSubmit) {
      e.preventDefault();
      void handleSubmit();
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
              {q.options.map((opt, oi) => (
                <OptionRow
                  key={oi}
                  selected={isOptionActive(answer, q, opt.label)}
                  multi={q.multiSelect}
                  onClick={() => toggleOption(qi, opt.label, q.multiSelect)}
                >
                  <OptionBody
                    label={opt.label}
                    description={opt.description}
                    preview={opt.preview}
                  />
                </OptionRow>
              ))}
              {/* Not a button — the row's own control is the input it wraps. */}
              <OptionRow
                selected={otherActive}
                multi={q.multiSelect}
                align="center"
              >
                <ControlSizeProvider size="sm">
                  <Input
                    value={answer.otherText}
                    onChange={(e) =>
                      setOtherText(qi, e.target.value, q.multiSelect)
                    }
                    onFocus={() => focusOther(qi, q.multiSelect)}
                    placeholder="Other…"
                    className="w-full"
                  />
                </ControlSizeProvider>
              </OptionRow>
            </Stack>
          </div>
        );
      })}
      <Stack direction="row" gap="sm" justify="end">
        {secondaryAction}
        <Button disabled={!canSubmit} onClick={handleSubmit}>
          Submit
        </Button>
      </Stack>
    </Stack>
  );
}
