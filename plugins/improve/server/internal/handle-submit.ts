import { createTask } from "@plugins/tasks-core/server";
import { attachAttachment, getAttachment } from "@plugins/attachments/server";
import { createConversation } from "@plugins/conversations/server";
import { IMPROVEMENTS_META_TASK_ID } from "./meta-improvements";
import { renderPrompt } from "./render-prompt";
import type { ImproveSubmitBody, ImproveSubmitResponse } from "../../shared/types";

const OWNER_TYPE = "task";

export async function handleSubmit(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => null)) as ImproveSubmitBody | null;
  if (!body || typeof body.text !== "string") {
    return new Response("body must be { text, url, attachmentIds, launch }", { status: 400 });
  }
  const text = body.text.trim();
  if (!text) return new Response("text is required", { status: 400 });
  const url = typeof body.url === "string" ? body.url : "";
  const attachmentIds = Array.isArray(body.attachmentIds)
    ? body.attachmentIds.filter((id): id is string => typeof id === "string")
    : [];
  const launch = body.launch === "sonnet" || body.launch === "opus" ? body.launch : null;

  // Validate every attachment exists and is still staged before creating the task.
  // Partial failure after task creation would leave orphans.
  const attachments = [];
  for (const id of attachmentIds) {
    const row = await getAttachment(id);
    if (!row) return new Response(`attachment ${id} not found`, { status: 400 });
    if (row.ownerId !== null) {
      return new Response(`attachment ${id} is already attached`, { status: 409 });
    }
    attachments.push(row);
  }

  const task = await createTask({
    parentId: IMPROVEMENTS_META_TASK_ID,
    title: synthesiseTitle(text),
    description: renderTaskDescription({ text, url, attachments }),
    author: "improve-plugin",
  });

  for (const att of attachments) {
    await attachAttachment(att.id, OWNER_TYPE, task.id);
  }

  let conversationId: string | null = null;
  if (launch) {
    const prompt = renderPrompt({
      text,
      url,
      attachmentPaths: attachments.map((a) => a.diskPath),
    });
    const conv = await createConversation({
      taskId: task.id,
      prompt,
      model: launch,
    });
    conversationId = conv.id;
  }

  const res: ImproveSubmitResponse = { taskId: task.id, conversationId };
  return Response.json(res);
}

function synthesiseTitle(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? text;
  return firstLine.length > 80 ? `${firstLine.slice(0, 77)}…` : firstLine;
}

function renderTaskDescription(opts: {
  text: string;
  url: string;
  attachments: { id: string; filename: string }[];
}): string {
  const lines: string[] = [opts.text, "", "---"];
  if (opts.url) lines.push(`**URL:** ${opts.url}`);
  if (opts.attachments.length > 0) {
    lines.push("**Attachments:**");
    for (const att of opts.attachments) {
      lines.push(`- [${att.filename}](/api/attachments/${att.id})`);
    }
  }
  return lines.join("\n");
}
