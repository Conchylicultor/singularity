import { sendConversationTurn } from "@plugins/conversations/plugins/conversation-view/plugins/pending-turn/web";
import { answerQuestionDelivery } from "../internal/delivery";
import { AnswerForm } from "./answer-form";
import { answerDraftScope } from "./answer-draft";
import {
  serializeMarkerAnswer,
  type AnswerSelections,
  type Question,
} from "./answer-model";

/**
 * The answer form for a question the terminal already cancelled (the flush
 * path: hookless sessions, or a question released to the terminal and then
 * pulled back with "Answer here"). The answer reaches the agent as a pasted
 * turn, after the cancelled call.
 */
export function MarkerAnswerForm({
  questions,
  convId,
  toolUseId,
}: {
  questions: Question[];
  convId: string;
  toolUseId: string;
}) {
  // An answer is a turn: it reaches the agent through the same tmux paste and
  // can be lost the same way, so it goes through the one send entry point and
  // inherits the confirmation deadline, the unconfirmed report and Retry.
  // `echo: false` — the question card is this send's in-flight display, and the
  // delivered turn is hidden from the transcript by our own EventFilter. The
  // send returns synchronously and the pending-turn record owns its fate, so
  // the answer counts as accepted at once.
  const submit = (selections: AnswerSelections) => {
    const text = serializeMarkerAnswer(questions, selections);
    sendConversationTurn(convId, {
      text,
      echo: false,
      delivery: answerQuestionDelivery,
      payload: { text },
    });
    return true;
  };
  return (
    <AnswerForm
      questions={questions}
      draftScope={answerDraftScope(convId, toolUseId)}
      onSubmit={submit}
    />
  );
}
