import { conversationsResource } from "@plugins/tasks-core/server";
import { ConversationModelSchema } from "../model";
import { createConversation } from "./lifecycle";

export async function handleCreate(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as {
    taskId?: string;
    attemptId?: string;
    prompt?: string;
    runtime?: string;
    model?: string;
  };

  const model =
    body.model !== undefined ? ConversationModelSchema.parse(body.model) : undefined;

  const session = await createConversation({
    taskId: body.taskId,
    attemptId: body.attemptId,
    prompt: body.prompt,
    runtimeId: body.runtime,
    model,
  });
  conversationsResource.notify();
  return Response.json(session);
}
