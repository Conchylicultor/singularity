import { getConversationClaudeSessionId } from "@plugins/tasks/plugins/tasks-core/server";
import { resolveConversationTranscriptPaths } from "@plugins/conversations/plugins/transcript-watcher/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { listConversationTurns } from "../../core/endpoints";
import { readTurnsFromChain } from "./claude-transcript";

export const handleListTurns = implement(listConversationTurns, async ({ params, query }) => {
  // The one thing the chain resolver cannot tell us: undefined = row not found
  // (404), vs null = row exists but has no session yet (an empty chain, 200).
  const claudeSessionId = await getConversationClaudeSessionId(params.id);
  if (claudeSessionId === undefined) throw new HttpError(404, "Not found");

  const paths = await resolveConversationTranscriptPaths(params.id);
  const turns = await readTurnsFromChain(paths, query.since);
  return { turns };
});
