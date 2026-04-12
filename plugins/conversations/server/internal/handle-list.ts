import { listConversations } from "./tmux";

export async function handleList(_req: Request): Promise<Response> {
  const sessions = await listConversations();
  return Response.json(sessions);
}
