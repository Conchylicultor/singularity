import { createClaudeSession } from "./tmux";

export async function handleCreate(_req: Request): Promise<Response> {
  const session = await createClaudeSession();
  return Response.json(session);
}
