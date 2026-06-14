import { notifyConversationsChanged } from "@plugins/tasks/plugins/tasks-core/server";
import { recordReport } from "@plugins/reports/server";
import { normalizeModel } from "@plugins/conversations/plugins/model-provider/core";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { createConversation as createConversationEndpoint } from "../../core/endpoints";
import { createConversation } from "./lifecycle";

export const handleCreate = implement(createConversationEndpoint, async ({ body }) => {
  const model =
    body.model !== undefined ? normalizeModel(body.model) : undefined;

  let session;
  try {
    session = await createConversation({
      taskId: body.taskId,
      attemptId: body.attemptId,
      prompt: body.prompt,
      runtimeId: body.runtime,
      model,
      forkFromConversationId: body.forkFromConversationId,
      prepromptId: body.prepromptId,
    });
  } catch (err) {
    notifyConversationsChanged();
    const message = err instanceof Error ? err.message : String(err);
    console.error("[conversations] createConversation failed", err);
    // Caught errors don't reach the unhandledRejection hook, so feed them to
    // recordReport explicitly. Dedup-by-fingerprint keeps a regression that
    // breaks every launch from spamming tasks; a single report row + task
    // surfaces the failure pattern instead.
    // eslint-disable-next-line promise-safety/no-bare-catch
    await recordReport({
      kind: "crash",
      source: "server-caught",
      message: `createConversation failed: ${message}`,
      data: {
        errorType: err instanceof Error ? err.name : "Error",
        stack: err instanceof Error ? err.stack ?? null : null,
        label: "conversations.handleCreate",
      },
    }).catch((e) => {
      console.error("[conversations] recordReport failed", e);
    });
    throw new HttpError(500, message);
  }
  notifyConversationsChanged();
  return session;
});
