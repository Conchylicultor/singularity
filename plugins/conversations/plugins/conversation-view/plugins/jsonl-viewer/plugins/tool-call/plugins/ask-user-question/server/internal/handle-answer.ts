import { implement } from "@plugins/infra/plugins/endpoints/server";
import { answerPrompt } from "@plugins/conversations/server";
import { answerAskUserQuestion } from "../../shared/endpoints";

export const handleAnswer = implement(answerAskUserQuestion, async ({ params, body }) => {
  // Dismiss the AskUserQuestion form, wait for it to clear, then send the
  // answers as a turn — all atomic inside answerPrompt() (see its contract).
  await answerPrompt(params.id, body.text);
  return { ok: true };
});
