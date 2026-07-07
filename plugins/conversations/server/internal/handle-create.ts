import { recordReport } from "@plugins/reports/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { createConversation as createConversationEndpoint } from "../../core/endpoints";
import { createConversation } from "./lifecycle";

export const handleCreate = implement(createConversationEndpoint, async ({ body }) => {
  // body.model is already a validated ConversationModel | undefined (the endpoint
  // body schema is the strict enum), so no normalization/coercion is needed here —
  // an unknown id was already rejected with a 400 before reaching this handler.
  let session;
  try {
    session = await createConversation({
      taskId: body.taskId,
      attemptId: body.attemptId,
      prompt: body.prompt,
      runtimeId: body.runtime,
      model: body.model,
      forkFromConversationId: body.forkFromConversationId,
      prepromptId: body.prepromptId,
      effort: body.effort,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[conversations] createConversation failed", err);
    // Caught errors don't reach the unhandledRejection hook, so feed them to
    // recordReport explicitly. Dedup-by-fingerprint keeps a regression that
    // breaks every launch from spamming tasks; a single report row + task
    // surfaces the failure pattern instead. This INCLUDES intentional 4xx
    // rejections like the container-task guard: nothing should ever try to
    // start an attempt inside a meta/folder task, so a caller reaching it has
    // a bug worth surfacing — fail loudly with a report. We only preserve the
    // error's own HTTP status below (a client mistake is a 4xx, not a 500).
    // eslint-disable-next-line promise-safety/no-bare-catch
    await recordReport({
      kind: "crash",
      source: "server-caught",
      message: `createConversation failed: ${message}`,
      data: {
        errorType: err instanceof Error ? err.name : "Error",
        stack: err instanceof Error ? err.stack ?? null : null,
        status: err instanceof HttpError ? err.status : 500,
        label: "conversations.handleCreate",
      },
    }).catch((e) => {
      console.error("[conversations] recordReport failed", e);
    });
    throw err instanceof HttpError ? err : new HttpError(500, message);
  }
  return session;
});
