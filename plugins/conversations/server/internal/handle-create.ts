import { createConversation } from "./lifecycle";
import { conversationsResource } from "./resources";

export async function handleCreate(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as {
    taskId?: string;
    attemptId?: string;
    prompt?: string;
    runtime?: string;
  };

  const session = await createConversation({
    taskId: body.taskId,
    attemptId: body.attemptId,
    prompt: body.prompt,
    runtimeId: body.runtime,
  });
  conversationsResource.notify();
  return Response.json(session);
}
