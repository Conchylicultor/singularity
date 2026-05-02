import {
  _taskAttachments,
  addTaskDependency,
  createTask,
  getTask,
  scheduleTaskTitleUpdate,
  synthesiseTitleFallback,
  type Task,
} from "@plugins/tasks-core/server";
import { getAttachment } from "@plugins/infra/plugins/attachments/server";
import {
  attachmentMarkdown,
  extractAttachmentIds,
} from "@plugins/primitives/plugins/paste-images/shared";
import {
  TaskChainSubmitBodySchema,
  type TaskChainCard,
  type TaskChainSubmitBody,
  type TaskChainSubmitResponse,
} from "@plugins/primitives/plugins/task-draft-form/shared";
import { db } from "@server/db/client";
import { armTaskAutoStart } from "./arm-auto-start";

export async function handleCreateChain(req: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return new Response("invalid JSON body", { status: 400 });
  }
  const parsed = TaskChainSubmitBodySchema.safeParse(raw);
  if (!parsed.success) {
    return new Response(`invalid body: ${parsed.error.message}`, { status: 400 });
  }
  const body: TaskChainSubmitBody = parsed.data;

  // Single parentId source — server does not care which target kind it came from.
  const parentId =
    body.target.kind === "metaTask"
      ? body.target.metaTaskId
      : body.target.parentTaskId;

  // Verify the parent exists. For "child" targets we also need it later to
  // inline its title/description if any head card has includeParentTask.
  const parentTask = await getTask(parentId);
  if (!parentTask) {
    return new Response(`parent task ${parentId} not found`, { status: 400 });
  }

  // Verify relate.taskId exists upfront so we don't half-create the chain
  // before discovering it's invalid.
  if (body.relate) {
    const rel = await getTask(body.relate.taskId);
    if (!rel) {
      return new Response(`relate task ${body.relate.taskId} not found`, { status: 400 });
    }
  }

  // Pre-resolve all attachments so a missing reference fails fast (improve's
  // existing invariant — partial chains leave dangling refs).
  const cardAttachments: { id: string; filename: string }[][] = [];
  for (let i = 0; i < body.cards.length; i++) {
    const card = body.cards[i]!;
    const ids = card.attachmentIds ?? [];
    const resolved: { id: string; filename: string }[] = [];
    for (const id of ids) {
      const row = await getAttachment(id);
      if (!row) {
        return new Response(`card ${i}: attachment ${id} not found`, { status: 400 });
      }
      resolved.push(row);
    }
    cardAttachments.push(resolved);
  }

  const author = body.target.kind === "metaTask" ? "improve-plugin" : "user";
  const taskIds: string[] = [];

  for (let i = 0; i < body.cards.length; i++) {
    const card = body.cards[i]!;
    const isHead = i === 0;
    const attachments = cardAttachments[i]!;

    const description = renderTaskDescription({
      text: card.text,
      url: card.url ?? "",
      attachments,
      parentTaskRef:
        isHead &&
        card.includeParentTask &&
        body.target.kind === "child"
          ? parentTask
          : null,
    });

    const fallbackTitle = synthesiseTitleFallback(card.text);
    const newTask = await createTask({
      parentId,
      title: fallbackTitle,
      description,
      author,
    });
    scheduleTaskTitleUpdate(newTask.id, card.text, fallbackTitle);
    taskIds.push(newTask.id);

    if (attachments.length > 0) {
      await db
        .insert(_taskAttachments)
        .values(
          attachments.map((a) => ({ ownerId: newTask.id, attachmentId: a.id })),
        )
        .onConflictDoNothing();
    }

    // Compute blockers for this card.
    const blockerIds: string[] = [];
    if (isHead && body.relate) {
      if (body.relate.mode === "followup") {
        // New task waits on the related (existing) task.
        blockerIds.push(body.relate.taskId);
      } else {
        // Prerequisite: existing task waits on the new task.
        await addTaskDependency(body.relate.taskId, newTask.id);
        // No forward blocker for the new task from relate.
      }
    }
    if (!isHead) {
      blockerIds.push(taskIds[i - 1]!);
    }

    for (const dep of blockerIds) {
      await addTaskDependency(newTask.id, dep);
    }

    if (card.launch !== null) {
      await armTaskAutoStart({
        taskId: newTask.id,
        model: card.launch,
        dependencies: blockerIds,
      });
    }
  }

  const res: TaskChainSubmitResponse = { taskIds };
  return Response.json(res);
}

function renderTaskDescription(opts: {
  text: string;
  url: string;
  attachments: { id: string; filename: string }[];
  parentTaskRef: Task | null;
}): string {
  // Attachments already referenced inline in the text are intentionally omitted
  // from the explicit section — they're visible where the user placed them and
  // a second copy would confuse the agent.
  const inlineIds = new Set(extractAttachmentIds(opts.text));
  const extraAttachments = opts.attachments.filter((a) => !inlineIds.has(a.id));

  const hasContext =
    opts.url || extraAttachments.length > 0 || opts.parentTaskRef !== null;
  if (!hasContext) return opts.text;

  const lines: string[] = [opts.text, "", "---"];
  if (opts.url) lines.push(`**URL:** ${opts.url}`);
  if (extraAttachments.length > 0) {
    lines.push("**Attachments:**");
    for (const att of extraAttachments) {
      lines.push(`- ${attachmentMarkdown(att.id, att.filename)}`);
    }
  }
  if (opts.parentTaskRef) {
    const t = opts.parentTaskRef;
    const desc = t.description?.trim() || "(no description)";
    lines.push("");
    lines.push(`<parent-task id="${t.id}">`);
    lines.push(`**Title:** ${t.title}`);
    lines.push(`**Description:**`);
    lines.push(desc);
    lines.push(`</parent-task>`);
  }
  return lines.join("\n");
}

// Re-exported for clarity in tests / other server modules that want the type.
export type { TaskChainCard };
