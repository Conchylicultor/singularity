import { type ReactNode } from "react";
import { ToolCallFrame } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { rigidClass } from "@plugins/primitives/plugins/css/plugins/rigid/web";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { type Question } from "./answer-model";

/** The card header's summary: one header chip per question, the first question, and its answer. */
export function summaryFor(questions: Question[], firstAnswerParts: string[]) {
  return (
    <Line as="span" className="gap-xs">
      {questions.length > 0 ? (
        questions.map((q, i) => (
          <Badge
            key={i}
            colorClass="bg-info/15 text-info"
            className={cn(rigidClass(), "font-mono")}
          >
            {q.header}
          </Badge>
        ))
      ) : (
        <Badge
          colorClass="bg-info/15 text-info"
          className={cn(rigidClass(), "font-mono")}
        >
          question
        </Badge>
      )}
      {questions[0]?.question && (
        <Text tone="muted">{questions[0].question}</Text>
      )}
      {firstAnswerParts.length > 0 && (
        <>
          <span className={cn(rigidClass(), "text-muted-foreground/50")}>
            &rarr;
          </span>
          <Text className="text-foreground">{firstAnswerParts.join(", ")}</Text>
        </>
      )}
    </Line>
  );
}

/**
 * An AskUserQuestion that is not a transcript event yet — a call a hook is
 * holding, still in flight — drawn as the same card the transcript draws it
 * with (tool badge, header chips, first question), so the two read as one.
 */
export function QuestionCard({
  questions,
  children,
}: {
  questions: Question[];
  children?: ReactNode;
}) {
  return (
    <ToolCallFrame
      name="AskUserQuestion"
      summary={summaryFor(questions, [])}
      defaultOpen
      running
    >
      {children}
    </ToolCallFrame>
  );
}
