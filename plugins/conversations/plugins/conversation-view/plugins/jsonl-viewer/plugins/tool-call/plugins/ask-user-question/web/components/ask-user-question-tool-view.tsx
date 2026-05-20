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

function parseAnswerMap(
  content: string,
  questions: Question[],
): Record<string, string> {
  const payload = extractPayload(content);

  const answers: Record<string, string> = {};
  const anchors: { question: string; valueStart: number }[] = [];

  for (const q of questions) {
    const anchor = `"${q.question}"="`;
    const idx = payload.indexOf(anchor);
    if (idx !== -1) {
      anchors.push({ question: q.question, valueStart: idx + anchor.length });
    }
  }

  anchors.sort((a, b) => a.valueStart - b.valueStart);

  for (let i = 0; i < anchors.length; i++) {
    const cur = anchors[i]!;
    const next = anchors[i + 1];
    const end = next != null
      ? payload.lastIndexOf('"', next.valueStart - 1)
      : payload.length;
    const raw = payload.slice(cur.valueStart, end);
    answers[cur.question] = raw.endsWith('"') ? raw.slice(0, -1) : raw;
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
      ? parseAnswerMap(resultContent, questions)
      : null;

  const questionSelections = questions.map((q) =>
    parseSelectedLabels(answerMap?.[q.question], q.options),
  );

  const firstSel = questionSelections[0];
  const firstAnswerParts = firstSel
    ? [...firstSel.selected, ...(firstSel.otherText ? [firstSel.otherText] : [])]
    : [];

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

  return (
    <ToolCallCard event={event} summary={summary} defaultOpen>
      <div className="mt-2 space-y-3">
        {questions.map((q, qi) => {
          const { selected, otherText } = questionSelections[qi] ?? {
            selected: new Set<string>(),
            otherText: null,
          };
          const hasAnswer = selected.size > 0 || otherText != null;

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
