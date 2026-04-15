import { db } from "../../../../server/src/db/client";
import { taskAttempts } from "@plugins/tasks/server/schema";
import { createConversation } from "./lifecycle";
import { conversationsResource } from "./resources";

export async function handleCreate(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as {
    taskId?: string;
    prompt?: string;
  };

  let taskAttemptId: string | undefined;
  if (body.taskId) {
    const id = `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const [attempt] = await db
      .insert(taskAttempts)
      .values({ id, taskId: body.taskId })
      .returning();
    taskAttemptId = attempt!.id;
  }

  const session = await createConversation({
    taskAttemptId,
    prompt: body.prompt,
  });
  const conversation = JSON.parse(JSON.stringify(session));
  conversationsResource.notify();
  return Response.json(conversation);
}
