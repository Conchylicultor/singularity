import { findTranscriptPath } from "@plugins/conversations/server";
import { getConversationClaudeSessionId } from "@plugins/tasks-core/server";
import { readJsonlEvents } from "./parse-jsonl";

export async function handleListEvents(
  _req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const id = params.id;
  if (!id) return new Response("Missing id", { status: 400 });

  const claudeSessionId = await getConversationClaudeSessionId(id);
  if (claudeSessionId === undefined)
    return new Response("Not found", { status: 404 });
  if (!claudeSessionId) return Response.json({ events: [] });

  const path = await findTranscriptPath(claudeSessionId);
  if (!path) return Response.json({ events: [] });

  const events = await readJsonlEvents(path);
  return Response.json({ events });
}
