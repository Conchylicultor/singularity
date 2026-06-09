import { useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import { useDraft } from "@plugins/primitives/plugins/persistent-draft/web";
import { toast } from "@plugins/notifications/web";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { answerAskUserQuestion, ANSWER_MARKER } from "../../shared";
import { Indicator, type Question } from "./ask-user-question-tool-view";

// Persisted shape: `selected` is a string[] (not a Set) so the draft survives a
// JSON round-trip through localStorage via useDraft.
interface QuestionAnswer {
  selected: string[];
  otherText: string;
}

function isAnswered(answer: QuestionAnswer, question: Question): boolean {
  // Multi-select (checkbox) questions accept zero selections as a valid
  // answer ("none of these"); only single-select requires a choice.
  if (question.multiSelect) return true;
  return answer.selected.length > 0 || answer.otherText.trim().length > 0;
}

function serializeAnswers(
  questions: Question[],
  answers: QuestionAnswer[],
): string {
  const lines = questions.map((q, qi) => {
    const answer = answers[qi]!;
    const parts = [...answer.selected];
    const trimmed = answer.otherText.trim();
    if (trimmed.length > 0) parts.push(trimmed);
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
    () => questions.map(() => ({ selected: [], otherText: "" })),
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
      // Single-select: choosing an option clears any freeform text.
      updateAnswer(qi, { selected: [label], otherText: "" });
    }
  };

  const setOtherText = (qi: number, value: string, multiSelect: boolean) => {
    const current = answers[qi]!;
    if (multiSelect) {
      // Multi-select: "Other" is additive to any selected options.
      updateAnswer(qi, { ...current, otherText: value });
    } else {
      // Single-select: typing freeform clears option selection.
      updateAnswer(qi, { selected: [], otherText: value });
    }
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

  const canSubmit =
    answers.every((a, qi) => isAnswered(a, questions[qi]!)) && !m.isPending;

  const handleSubmit = () => {
    const text = serializeAnswers(questions, answers);
    m.mutate({ params: { id: convId }, body: { text } });
  };

  return (
    <div className="mt-2 space-y-3">
      {questions.map((q, qi) => {
        const answer = answers[qi]!;
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
                const isSelected = answer.selected.includes(opt.label);
                return (
                  <button
                    key={oi}
                    type="button"
                    onClick={() =>
                      toggleOption(qi, opt.label, q.multiSelect)
                    }
                    className={`flex w-full gap-2 text-left transition-colors ${
                      isSelected
                        ? "rounded-md border-l-2 border-primary bg-primary/5 py-1 pl-2"
                        : "rounded-md py-1 pl-0.5 hover:bg-muted/50"
                    }`}
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
                  </button>
                );
              })}
              <div
                className={`flex items-center gap-2 ${
                  answer.otherText.trim().length > 0
                    ? "rounded-md border-l-2 border-primary bg-primary/5 py-1 pl-2"
                    : "pl-0.5"
                }`}
              >
                <Indicator
                  selected={answer.otherText.trim().length > 0}
                  multi={q.multiSelect}
                />
                <Input
                  value={answer.otherText}
                  onChange={(e) =>
                    setOtherText(qi, e.target.value, q.multiSelect)
                  }
                  placeholder="Other…"
                  className="h-7 flex-1 text-xs"
                />
              </div>
            </div>
          </div>
        );
      })}
      <div className="flex justify-end">
        <Button
          size="sm"
          disabled={!canSubmit}
          onClick={handleSubmit}
        >
          {m.isPending ? "Submitting…" : "Submit"}
        </Button>
      </div>
    </div>
  );
}
