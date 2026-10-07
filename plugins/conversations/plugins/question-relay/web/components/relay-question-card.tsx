import { useState } from "react";
import { useLive } from "@plugins/network/plugins/live/web";
import { useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import { ResourceErrorInline } from "@plugins/primitives/plugins/live-state/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { Card } from "@plugins/primitives/plugins/css/plugins/card/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import {
  AnswerForm,
  AnswerHereButton,
  answerDraftScope,
  type FormAnswer,
} from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/plugins/ask-user-question/web";
import {
  answerRelayQuestion,
  pendingQuestions,
  releaseRelayQuestion,
  type PendingQuestion,
} from "../../core";

/**
 * The `"question"` pending prompt. A question the relay is holding is answered
 * right here, as the tool's real answer — no Escape, no pasted turn. With no
 * held question (a session launched without the relay hook, or one released to
 * the terminal) it is the "Answer here" flush affordance.
 */
export function RelayQuestionCard({
  conversationId,
  waitingFor,
}: {
  conversationId: string;
  waitingFor: string;
}) {
  const held = useLive(pendingQuestions, { where: { conversationId } });
  // The question this card answered: its row leaves the collection at once,
  // while the conversation stays "waiting on a question" until the reconciler
  // sees the agent move on (which unmounts this card). Say the answer is on its
  // way meanwhile, rather than flashing the "Answer here" fallback.
  const [answered, setAnswered] = useState<string | null>(null);

  if (held.status === "loading") return <Loading label="Loading question…" />;
  if (held.status === "error") {
    return (
      <ResourceErrorInline
        variant="inline"
        subject="the held question"
        error={held.error}
        refetch={held.refetch}
      />
    );
  }
  // Oldest first: the CLI asks one question call at a time.
  const question = held.data[0];
  if (question) {
    return (
      <HeldQuestion
        key={question.toolUseId}
        question={question}
        onAnswered={() => setAnswered(question.toolUseId)}
      />
    );
  }
  if (answered !== null) {
    return (
      <Text as="p" variant="caption" tone="muted">
        Answer sent — the agent is reading it.
      </Text>
    );
  }
  return (
    <AnswerHereButton conversationId={conversationId} waitingFor={waitingFor} />
  );
}

function HeldQuestion({
  question,
  onAnswered,
}: {
  question: PendingQuestion;
  onAnswered: () => void;
}) {
  const params = {
    id: question.conversationId,
    toolUseId: question.toolUseId,
  };
  const answer = useEndpointMutation(answerRelayQuestion);
  const release = useEndpointMutation(releaseRelayQuestion);

  // Not a turn: the answer is the tool's own input, so there is no pending-turn
  // record — the tool result landing in the transcript is the confirmation. A
  // failed POST is reported by the mutation's global toast, and the form keeps
  // the user's picks (it clears its draft only on `true`).
  const submit = ({ selections, response }: FormAnswer): Promise<boolean> =>
    answer
      .mutateAsync({
        params,
        body: { selections, ...(response ? { response } : {}) },
      })
      .then(
        () => {
          onAnswered();
          return true;
        },
        () => false,
      );

  return (
    <Card>
      <Stack gap="xs">
        <Text as="p" variant="caption" tone="muted">
          The agent is asking — answer here, or in the terminal
        </Text>
        <AnswerForm
          questions={question.questions}
          draftScope={answerDraftScope(
            question.conversationId,
            question.toolUseId,
          )}
          onSubmit={submit}
          secondaryAction={
            <Button
              variant="ghost"
              loading={release.isPending}
              onClick={() => release.mutate({ params })}
            >
              Answer in terminal
            </Button>
          }
        />
      </Stack>
    </Card>
  );
}
