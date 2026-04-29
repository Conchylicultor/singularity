import { eq } from "drizzle-orm";
import { db } from "@server/db/client";
import { syncOwnerAttachments } from "@plugins/infra/plugins/attachments/server";
import { _conversationAttachments } from "@plugins/tasks-core/server";
import { sendTurn } from "./runtime";
import { resolveAttachmentRefs } from "./resolve-prompt-attachments";

// JSON only: { text: string }. The text is markdown that may contain
// `![](/api/attachments/<id>)` refs; we resolve those into `@<disk-path>`
// before handing the prompt to the agent and additively link the referenced
// attachments to this conversation so the orphan sweep leaves them alone.
export async function handlePostTurn(
  req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const id = params.id;
  if (!id) return new Response("Missing id", { status: 400 });
  if (!/^[A-Za-z0-9_-]+$/.test(id)) {
    return new Response("invalid id", { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as { text?: unknown };
  if (typeof body.text !== "string" || body.text.length === 0) {
    return Response.json({ error: "body.text required" }, { status: 400 });
  }

  const { text: resolved, attachmentIds } = await resolveAttachmentRefs(
    body.text,
  );
  const finalText = resolved.trim();
  if (finalText.length === 0) {
    return Response.json({ error: "text required" }, { status: 400 });
  }

  if (attachmentIds.length > 0) {
    // A turn never *removes* attachments from a conversation, only adds.
    // Past turns may still reference earlier attachments, so we union the
    // current link set with the new ids before reconciling.
    const existing = await db
      .select({ attachmentId: _conversationAttachments.attachmentId })
      .from(_conversationAttachments)
      .where(eq(_conversationAttachments.ownerId, id));
    const merged = new Set<string>([
      ...existing.map((r) => r.attachmentId),
      ...attachmentIds,
    ]);
    await syncOwnerAttachments(
      _conversationAttachments,
      id,
      Array.from(merged),
    );
  }

  try {
    await sendTurn(id, finalText);
  } catch (err) {
    if (err instanceof Error && err.message.includes("not found")) {
      return new Response("Not found", { status: 404 });
    }
    throw err;
  }
  return Response.json({ ok: true, attachmentIds });
}
