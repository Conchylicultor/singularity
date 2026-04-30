import {
  createTask,
  addTaskDependency,
  scheduleTaskTitleUpdate,
  synthesiseTitleFallback,
  _taskAttachments,
} from "@plugins/tasks-core/server";
import { armTaskAutoStart } from "@plugins/tasks/server";
import { getAttachment } from "@plugins/infra/plugins/attachments/server";
import { attachmentMarkdown } from "@plugins/primitives/plugins/paste-images/shared";
import { db } from "@server/db/client";
import { IMPROVEMENTS_META_TASK_ID } from "./meta-improvements";
import { _improvePendingGroups } from "./tables";
import type {
  ImproveSubmitBody,
  ImproveSubmitCard,
  ImproveSubmitResponse,
} from "../../shared/types";

export async function handleSubmit(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => null)) as ImproveSubmitBody | null;
  if (!body || !Array.isArray(body.cards) || body.cards.length === 0) {
    return new Response("body must be { cards: [{ text, launch, url?, attachmentIds? }...] }", {
      status: 400,
    });
  }
  const groupId = typeof body.groupId === "string" && body.groupId ? body.groupId : null;

  type ParsedCard = {
    text: string;
    launch: "sonnet" | "opus" | null;
    url: string;
    attachments: { id: string; filename: string }[];
  };

  // Validate all cards and attachments upfront — partial failure mid-chain
  // would leave orphan tasks with dangling references.
  const cards: ParsedCard[] = [];
  for (let i = 0; i < body.cards.length; i++) {
    const c = body.cards[i] as ImproveSubmitCard | undefined;
    const text = typeof c?.text === "string" ? c.text.trim() : "";
    if (!text) {
      return new Response(`card ${i}: text is required`, { status: 400 });
    }
    const launch =
      c?.launch === "sonnet" || c?.launch === "opus" ? c.launch : null;
    const url = typeof c?.url === "string" ? c.url : "";
    const attachmentIds = Array.isArray(c?.attachmentIds)
      ? c.attachmentIds.filter((id): id is string => typeof id === "string")
      : [];

    const attachments = [];
    for (const id of attachmentIds) {
      const row = await getAttachment(id);
      if (!row) return new Response(`card ${i}: attachment ${id} not found`, { status: 400 });
      attachments.push(row);
    }

    cards.push({ text, launch, url, attachments });
  }

  const taskIds: string[] = [];
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i]!;
    const description = renderTaskDescription({
      text: card.text,
      url: card.url,
      attachments: card.attachments,
    });

    const fallbackTitle = synthesiseTitleFallback(card.text);
    const task = await createTask({
      parentId: IMPROVEMENTS_META_TASK_ID,
      title: fallbackTitle,
      description,
      author: "improve-plugin",
    });
    scheduleTaskTitleUpdate(task.id, card.text, fallbackTitle);
    taskIds.push(task.id);

    if (card.attachments.length > 0) {
      await db
        .insert(_taskAttachments)
        .values(card.attachments.map((a) => ({ ownerId: task.id, attachmentId: a.id })))
        .onConflictDoNothing();
    }

    const blockerId = i > 0 ? taskIds[i - 1]! : null;
    if (blockerId) await addTaskDependency(task.id, blockerId);

    if (card.launch) {
      await armTaskAutoStart({
        taskId: task.id,
        model: card.launch,
        dependencies: blockerId ? [blockerId] : [],
      });
    }

    if (groupId) {
      await db
        .insert(_improvePendingGroups)
        .values({ taskId: task.id, groupId })
        .onConflictDoUpdate({
          target: _improvePendingGroups.taskId,
          set: { groupId },
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
      lines.push(`- ${attachmentMarkdown(att.id, att.filename)}`);
    }
  }
  return lines.join("\n");
}
