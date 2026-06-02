import { useState } from "react";
import { useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import { toast } from "@plugins/notifications/web";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { answerAskUserQuestion, ANSWER_MARKER } from "../../shared";
import { Indicator, type Question } from "./ask-user-question-tool-view";

interface QuestionAnswer {
  selected: Set<string>;
  otherText: string;
}

function isAnswered(answer: QuestionAnswer): boolean {
  return answer.selected.size > 0 || answer.otherText.trim().length > 0;
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
}: {
  questions: Question[];
  convId: string;
}) {
  const [answers, setAnswers] = useState<QuestionAnswer[]>(() =>
    questions.map(() => ({ selected: new Set<string>(), otherText: "" })),
  );

  const updateAnswer = (qi: number, next: QuestionAnswer) => {
    setAnswers((prev) => prev.map((a, i) => (i === qi ? next : a)));
  };

  const toggleOption = (qi: number, label: string, multiSelect: boolean) => {
    const current = answers[qi]!;
    if (multiSelect) {
      const selected = new Set(current.selected);
      if (selected.has(label)) selected.delete(label);
      else selected.add(label);
      updateAnswer(qi, { ...current, selected });
    } else {
      // Single-select: choosing an option clears any freeform text.
      updateAnswer(qi, { selected: new Set([label]), otherText: "" });
    }
  };

  const setOtherText = (qi: number, value: string, multiSelect: boolean) => {
    const current = answers[qi]!;
    if (multiSelect) {
      // Multi-select: "Other" is additive to any selected options.
      updateAnswer(qi, { ...current, otherText: value });
    } else {
      // Single-select: typing freeform clears option selection.
      updateAnswer(qi, { selected: new Set<string>(), otherText: value });
    }
  };

  const m = useEndpointMutation(answerAskUserQuestion, {
    onError: (err) =>
      toast({
        type: "conversation",
        description: `Answer failed: ${err.message}`,
        variant: "error",
      }),
  });

  const canSubmit = answers.every(isAnswered) && !m.isPending;

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
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {q.header}
              </p>
            )}
            <p className="mb-1.5 text-xs text-foreground">{q.question}</p>
            <div className="space-y-1">
              {q.options.map((opt, oi) => {
                const isSelected = answer.selected.has(opt.label);
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
