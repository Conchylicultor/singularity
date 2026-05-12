import fs from "node:fs/promises";
import {
  createConversation,
  deleteConversation,
} from "@plugins/conversations/server";
import { getConversation } from "@plugins/tasks-core/server";
import { buildSummarizePayload } from "./prompt";

// Cap how long the summarising conversation may live before we reap it.
const CLEANUP_AFTER_MS = 5 * 60 * 1000;

export async function handleGenerate(
  _req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const conversationId = params.conversationId;
  if (!conversationId) {
    return Response.json(
      { error: "Missing conversationId in path" },
      { status: 400 },
    );
  }
  const contextPath = `/tmp/singularity-summary-${conversationId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.xml`;

  let payload;
  try {
    payload = await buildSummarizePayload(conversationId, contextPath);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }

  await fs.writeFile(contextPath, payload.context, "utf8");

  const parent = await getConversation(conversationId);
  if (!parent) {
    return Response.json(
      { error: `Parent conversation ${conversationId} not found` },
      { status: 404 },
    );
  }

  const conv = await createConversation({
    prompt: payload.prompt,
    model: "sonnet",
    kind: "system",
    spawnedBy: "conversation-summary",
    attemptId: parent.attemptId,
  });

  setTimeout(() => {
    // eslint-disable-next-line promise-safety/no-bare-catch
    deleteConversation(conv.id).catch((err) => {
      console.error(`[conversation-summary] cleanup of ${conv.id} failed`, err);
    });
    void fs.unlink(contextPath);
  }, CLEANUP_AFTER_MS).unref();

  return Response.json(
    {
      spawnedConversationId: conv.id,
      turnCount: payload.turnCount,
    },
    { status: 202 },
  );
}
