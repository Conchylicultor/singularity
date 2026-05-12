import { recentConversationsResource } from "@plugins/tasks-core/server";
import { recordCrash } from "@plugins/crashes/server";
import { ConversationModelSchema } from "@plugins/conversations/plugins/model-provider/core";
import { createConversation } from "./lifecycle";

export async function handleCreate(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as {
    taskId?: string;
    attemptId?: string;
    prompt?: string;
    runtime?: string;
    model?: string;
    forkFromConversationId?: string;
  };

  const model =
    body.model !== undefined ? ConversationModelSchema.parse(body.model) : undefined;

  let session;
  try {
    session = await createConversation({
      taskId: body.taskId,
      attemptId: body.attemptId,
      prompt: body.prompt,
      runtimeId: body.runtime,
      model,
      forkFromConversationId: body.forkFromConversationId,
    });
  } catch (err) {
    recentConversationsResource.notify();
    const message = err instanceof Error ? err.message : String(err);
    console.error("[conversations] createConversation failed", err);
    // Caught errors don't reach the unhandledRejection hook, so feed them to
    // recordCrash explicitly. Dedup-by-fingerprint keeps a regression that
    // breaks every launch from spamming tasks; a single crash row + task
    // surfaces the failure pattern instead.
    await recordCrash({
      source: "server-caught",
      errorType: err instanceof Error ? err.name : "Error",
      message: `createConversation failed: ${message}`,
      stack: err instanceof Error ? err.stack ?? null : null,
      label: "conversations.handleCreate",
    }).catch((e) => {
      console.error("[conversations] recordCrash failed", e);
    });
    return Response.json({ error: message }, { status: 500 });
  }
  recentConversationsResource.notify();
  return Response.json(session);
}
