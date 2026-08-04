import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { defineTurnDelivery } from "@plugins/conversations/plugins/conversation-view/plugins/pending-turn/web";
import { answerAskUserQuestion } from "../../shared";

/**
 * Answering an AskUserQuestion is a turn send wearing a different hat: the
 * serialized answer lands in the transcript as an ordinary `user-text` row (the
 * one this plugin hides at render time), delivered through the same tmux paste
 * that can silently drop it. It travels over `answer-question` rather than
 * `turn` only because the runtime must first dismiss the CLI's interactive menu
 * — a delivery difference, not a lifecycle one.
 *
 * Routing it through `sendConversationTurn` buys the answer the same
 * confirmation deadline, `turn-unconfirmed` report and Retry affordance every
 * other send has. The record is created with `echo: false`: the question card
 * already shows its own answered state, and the delivered turn is hidden from
 * the transcript, so an echo card would be the one piece of duplicated UI.
 */
export const answerQuestionDelivery = defineTurnDelivery<{ text: string }>({
  id: "ask-user-question-answer",
  async send(conversationId, payload, signal) {
    await fetchEndpoint(
      answerAskUserQuestion,
      { id: conversationId },
      { body: { text: payload.text }, signal },
    );
    // The server pastes the text verbatim; the record's own text matches.
    return { resolvedText: null };
  },
});
