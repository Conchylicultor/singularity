import { getConversationClaudeSessionId } from "@plugins/tasks/plugins/tasks-core/server";
import { findTranscriptPath } from "@plugins/conversations/plugins/transcript-watcher/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { listConversationTurns } from "../../core/endpoints";
import { readTurns } from "./claude-transcript";

export const handleListTurns = implement(listConversationTurns, async ({ params, query }) => {
  // undefined = row not found; null = row exists but no session yet
  const claudeSessionId = await getConversationClaudeSessionId(params.id);
  if (claudeSessionId === undefined) throw new HttpError(404, "Not found");
  if (!claudeSessionId) return { turns: [] };

  const path = await findTranscriptPath(claudeSessionId);
  if (!path) return { turns: [] };

  const turns = await readTurns(path, query.since);
  return { turns };
});
