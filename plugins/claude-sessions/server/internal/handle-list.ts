import { listClaudeSessions } from "./tmux";

export async function handleList(_req: Request): Promise<Response> {
  const sessions = await listClaudeSessions();
  return Response.json(sessions);
}
