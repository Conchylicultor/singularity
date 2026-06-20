import { implement } from "@plugins/infra/plugins/endpoints/server";
import { flushInteractivePrompt } from "@plugins/conversations/server";
import { updateConversation } from "@plugins/tasks/plugins/tasks-core/server";
import { flushQuestion } from "../../shared/endpoints";

export const handleFlush = implement(flushQuestion, async ({ params }) => {
  await flushInteractivePrompt(params.id);
  await updateConversation(params.id, { waitingFor: null });
  return { ok: true };
});
