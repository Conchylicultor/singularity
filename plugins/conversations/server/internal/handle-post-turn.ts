import { conversationAttachments, getConversation } from "@plugins/tasks-core/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { postConversationTurn } from "../../core/endpoints";
import { sendTurn } from "./runtime";
import { resolveAttachmentRefs } from "./resolve-prompt-attachments";
import { userTurnSent } from "./tables-user-turn-sent-event";

// JSON only: { text: string }. The text is markdown that may contain
// `![](/api/attachments/<id>)` refs; we resolve those into `@<disk-path>`
// before handing the prompt to the agent and additively link the referenced
// attachments to this conversation so the orphan sweep leaves them alone.
export const handlePostTurn = implement(postConversationTurn, async ({ params, body }) => {
  const id = params.id;
  if (!/^[A-Za-z0-9_-]+$/.test(id)) {
    throw new HttpError(400, "invalid id");
  }

  const { text: resolved, attachmentIds } = await resolveAttachmentRefs(body.text);
  const finalText = resolved.trim();
  if (finalText.length === 0) {
    throw new HttpError(400, "text required");
  }

  if (attachmentIds.length > 0) {
    await conversationAttachments.add(id, attachmentIds);
  }

  try {
    await sendTurn(id, finalText);
  } catch (err) {
    if (err instanceof Error && err.message.includes("not found")) {
      throw new HttpError(404, "Not found");
    }
    throw err;
  }

  const conv = await getConversation(id);
  if (conv) {
    await userTurnSent.emit({
      conversationId: id,
      taskId: conv.taskId,
      text: body.text,
    });
  }

  return { ok: true, attachmentIds };
});
