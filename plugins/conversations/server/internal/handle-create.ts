import { createConversation } from "./lifecycle";
import { conversationsResource } from "./resources";

export async function handleCreate(_req: Request): Promise<Response> {
  const session = await createConversation();
  const conversation = JSON.parse(JSON.stringify(session));
  conversationsResource.notify();
  return Response.json(conversation);
}
