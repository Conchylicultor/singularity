import { getConversationClaudeSessionId } from "@plugins/tasks-core/server";
import { findTranscriptPath } from "@plugins/conversations/plugins/transcript-watcher/server";
import { readTurns } from "./claude-transcript";

export async function handleListTurns(
  req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const id = params.id;
  if (!id) return new Response("Missing id", { status: 400 });

  // undefined = row not found; null = row exists but no session yet
  const claudeSessionId = await getConversationClaudeSessionId(id);
  if (claudeSessionId === undefined) return new Response("Not found", { status: 404 });
  if (!claudeSessionId) return Response.json({ turns: [] });

  const path = await findTranscriptPath(claudeSessionId);
  if (!path) return Response.json({ turns: [] });

  const since = new URL(req.url).searchParams.get("since") ?? undefined;
  const turns = await readTurns(path, since);
  return Response.json({ turns });
}
