import { conversationAttachments, getConversation, getTask } from "@plugins/tasks-core/server";
import { scheduleTaskTitleUpdate } from "@plugins/tasks/plugins/task-title/server";
import { sendTurn } from "./runtime";
import { resolveAttachmentRefs } from "./resolve-prompt-attachments";

const UNINFORMATIVE_TITLES = ["Untitled", "Untitled conversation"];

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
    await conversationAttachments.add(id, attachmentIds);
  }

  try {
    await sendTurn(id, finalText);
  } catch (err) {
    if (err instanceof Error && err.message.includes("not found")) {
      return new Response("Not found", { status: 404 });
    }
    throw err;
  }

  // If the conversation was started with no prompt (task title is still
  // uninformative), upgrade it with this first real turn text.
  void (async () => {
    try {
      const conv = await getConversation(id);
      if (!conv) return;
      const task = await getTask(conv.taskId);
      if (!task || !UNINFORMATIVE_TITLES.includes(task.title)) return;
      scheduleTaskTitleUpdate(conv.taskId, body.text as string, task.title);
    } catch (err) {
      console.warn("[conversations] turn title upgrade failed:", err);
    }
  })();

  return Response.json({ ok: true, attachmentIds });
}
