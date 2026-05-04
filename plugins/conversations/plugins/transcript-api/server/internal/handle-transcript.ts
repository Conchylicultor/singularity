import { getConversationClaudeSessionId } from "@plugins/tasks-core/server";
import { findTranscriptPath } from "@plugins/conversations/plugins/transcript-watcher/server";

export async function handleTranscript(
  _req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const { id } = params;
  const claudeSessionId = await getConversationClaudeSessionId(id);
  if (claudeSessionId === undefined) return new Response("Not found", { status: 404 });
  if (!claudeSessionId) return Response.json({ path: null });
  const path = await findTranscriptPath(claudeSessionId);
  return Response.json({ path });
}
