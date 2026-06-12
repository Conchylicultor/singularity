import { getConversationClaudeSessionId } from "@plugins/tasks/plugins/tasks-core/server";
import { findTranscriptPath } from "@plugins/conversations/plugins/transcript-watcher/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { getConversationTranscript } from "../../shared/endpoints";

export const handleTranscript = implement(getConversationTranscript, async ({ params }) => {
  const claudeSessionId = await getConversationClaudeSessionId(params.id);
  if (claudeSessionId === undefined) throw new HttpError(404, "Not found");
  if (!claudeSessionId) return { path: null };
  const path = await findTranscriptPath(claudeSessionId);
  return { path };
});
