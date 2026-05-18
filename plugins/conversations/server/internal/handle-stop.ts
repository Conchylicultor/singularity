import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { stopConversation } from "../../core/endpoints";
import { interruptConversation, rewindConversationTurn } from "./runtime";

export const handleStop = implement(stopConversation, async ({ params }) => {
  try {
    await interruptConversation(params.id);
  } catch (err) {
    if (err instanceof Error && err.message.includes("not found")) {
      throw new HttpError(404, "Not found");
    }
    throw err;
  }
  const rewindText = await rewindConversationTurn(params.id);
  return { ok: true, rewindText: rewindText ?? null };
});
