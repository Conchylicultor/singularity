import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { resumeConversation } from "@plugins/conversations/server";
import { notifyConversationsChanged } from "@plugins/tasks/plugins/tasks-core/server";
import { resumeConversationEndpoint } from "../../core/endpoints";

export const handleResume = implement(resumeConversationEndpoint, async ({ params }) => {
  try {
    await resumeConversation(params.id);
    notifyConversationsChanged();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new HttpError(409, msg);
  }
});
