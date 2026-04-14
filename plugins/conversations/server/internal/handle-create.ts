import { createConversation } from "./lifecycle";
import { broadcast } from "./sse";

export async function handleCreate(_req: Request): Promise<Response> {
  const session = await createConversation();
  const conversation = JSON.parse(JSON.stringify(session));
  broadcast({ type: "created", conversation });
  return Response.json(conversation);
}
