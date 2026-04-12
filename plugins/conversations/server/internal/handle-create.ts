import { createConversation } from "./tmux";

export async function handleCreate(_req: Request): Promise<Response> {
  const session = await createConversation();
  return Response.json(session);
}
