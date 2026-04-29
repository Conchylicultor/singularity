import {
  createTask,
  addTaskDependency,
  scheduleTaskTitleUpdate,
  synthesiseTitleFallback,
  _taskAttachments,
} from "@plugins/tasks-core/server";
import { armTaskAutoStart } from "@plugins/tasks/server";
import { getAttachment } from "@plugins/infra/plugins/attachments/server";
import { db } from "@server/db/client";
import { IMPROVEMENTS_META_TASK_ID } from "./meta-improvements";
import type {
  ImproveSubmitBody,
  ImproveSubmitCard,
  ImproveSubmitResponse,
} from "../../shared/types";

export async function handleSubmit(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => null)) as ImproveSubmitBody | null;
  if (!body || !Array.isArray(body.cards) || body.cards.length === 0) {
    return new Response(
      "body must be { cards: [{ text, launch }...], url, attachmentIds }",
      { status: 400 },
    );
  }

  const cards: { text: string; launch: "sonnet" | "opus" | null }[] = [];
  for (let i = 0; i < body.cards.length; i++) {
    const c = body.cards[i] as ImproveSubmitCard | undefined;
    const text = typeof c?.text === "string" ? c.text.trim() : "";
    if (!text) {
      return new Response(`card ${i}: text is required`, { status: 400 });
    }
    const launch =
      c?.launch === "sonnet" || c?.launch === "opus" ? c.launch : null;
    cards.push({ text, launch });
  }

  const url = typeof body.url === "string" ? body.url : "";
  const attachmentIds = Array.isArray(body.attachmentIds)
    ? body.attachmentIds.filter((id): id is string => typeof id === "string")
    : [];

  // Validate every attachment exists before creating any task. Partial
  // failure mid-chain would leave orphan tasks with dangling references.
  const attachments = [];
  for (const id of attachmentIds) {
    const row = await getAttachment(id);
    if (!row) return new Response(`attachment ${id} not found`, { status: 400 });
    attachments.push(row);
  }

  const taskIds: string[] = [];
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i]!;
    const isHead = i === 0;
    // URL + attachments only attach to the head — they capture "the context
    // that prompted the chain", not per-card metadata.
    const description = isHead
      ? renderTaskDescription({ text: card.text, url, attachments })
      : card.text;

    const fallbackTitle = synthesiseTitleFallback(card.text);
    const task = await createTask({
      parentId: IMPROVEMENTS_META_TASK_ID,
      title: fallbackTitle,
      description,
      author: "improve-plugin",
    });
    scheduleTaskTitleUpdate(task.id, card.text, fallbackTitle);
    taskIds.push(task.id);

    if (isHead && attachments.length > 0) {
      await db
        .insert(_taskAttachments)
        .values(attachments.map((a) => ({ ownerId: task.id, attachmentId: a.id })))
        .onConflictDoNothing();
    }

    const blockerId = i > 0 ? taskIds[i - 1]! : null;
    if (blockerId) await addTaskDependency(task.id, blockerId);

    if (card.launch) {
      // Every card armed via the same path: head fires immediately
      // (no blockers), tail cards wait for the per-dep maybe-launch trigger
      // to fire when the previous card lands. The job builds the prompt
      // from the task's title + description (buildTaskPrompt), so URL and
      // attachment links rendered into the head's description flow through
      // to the agent automatically.
      await armTaskAutoStart({
        taskId: task.id,
        model: card.launch,
        dependencies: blockerId ? [blockerId] : [],
      });
    }
  }

  const res: ImproveSubmitResponse = { taskIds };
  return Response.json(res);
}

function renderTaskDescription(opts: {
  text: string;
  url: string;
  attachments: { id: string; filename: string }[];
}): string {
  const hasContext = opts.url || opts.attachments.length > 0;
  if (!hasContext) return opts.text;

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
