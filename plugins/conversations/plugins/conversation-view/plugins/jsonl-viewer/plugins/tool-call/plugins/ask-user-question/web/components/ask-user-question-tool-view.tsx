import type { ToolRendererProps } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/core";
import { ToolCallCard } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/web";

interface QuestionOption {
  label: string;
  description: string;
  preview?: string;
}

interface Question {
  question: string;
  header: string;
  options: QuestionOption[];
  multiSelect: boolean;
}

interface AskUserQuestionInput {
  questions: Question[];
}

function parseAnswerMap(content: string): Record<string, string> {
  const answers: Record<string, string> = {};
  const regex = /"((?:[^"\\]|\\.)*)"="((?:[^"\\]|\\.)*)"/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const key = match[1];
    const value = match[2];
    if (key != null && value != null)
      answers[key.replace(/\\"/g, '"')] = value.replace(/\\"/g, '"');
  }
  return answers;
}

function Indicator({
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

export function AskUserQuestionToolView({ event }: ToolRendererProps) {
  const input = event.input as AskUserQuestionInput;
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard; input is `as`-cast from unknown
  const questions = Array.isArray(input?.questions) ? input.questions : [];

  const resultContent = event.result?.content;
  const answerMap =
    resultContent && !event.result?.isError
      ? parseAnswerMap(resultContent)
      : null;

  const summary = (
    <span className="flex min-w-0 items-center gap-1.5">
      {questions.length > 0 ? (
        questions.map((q, i) => (
          <span
            key={i}
            className="shrink-0 rounded bg-blue-500/15 px-1.5 py-0.5 font-mono text-[11px] text-blue-700 dark:text-blue-400"
          >
            {q.header}
          </span>
        ))
      ) : (
        <span className="shrink-0 rounded bg-blue-500/15 px-1.5 py-0.5 font-mono text-[11px] text-blue-700 dark:text-blue-400">
          question
        </span>
      )}
      {questions[0]?.question && (
        <span className="min-w-0 truncate text-muted-foreground">
          {questions[0].question}
        </span>
      )}
    </span>
  );

  return (
    <ToolCallCard event={event} summary={summary} defaultOpen>
      <div className="mt-2 space-y-3">
        {questions.map((q, qi) => {
          const selectedLabel = answerMap?.[q.question];
          const matchedOption = q.options.find(
            (o) => o.label === selectedLabel,
          );
          const isOther = selectedLabel != null && !matchedOption;

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
                  const isSelected = opt.label === selectedLabel;
                  return (
                    <div
                      key={oi}
                      className={`flex gap-2 ${isSelected ? "rounded-md border-l-2 border-primary bg-primary/5 py-1 pl-2" : "pl-0.5"}`}
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
                {isOther && (
                  <div className="flex gap-2 rounded-md border-l-2 border-primary bg-primary/5 py-1 pl-2">
                    <Indicator selected multi={q.multiSelect} />
                    <p className="text-xs italic text-foreground">
                      {selectedLabel}
                    </p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {event.result?.isError && (
          <p className="text-xs text-destructive">{event.result.content}</p>
        )}
      </div>
    </ToolCallCard>
  );
}
