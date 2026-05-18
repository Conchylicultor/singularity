import {
  taskAttachments,
  addTaskDependency,
  createTask,
  getTask,
  getTaskDependencyIds,
  type Task,
} from "@plugins/tasks-core/server";
import {
  scheduleTaskTitleUpdate,
  synthesiseTitleFallback,
} from "@plugins/tasks/plugins/task-title/server";
import { getAttachment } from "@plugins/infra/plugins/attachments/server";
import {
  attachmentMarkdown,
  extractAttachmentIds,
} from "@plugins/primitives/plugins/text-editor/plugins/paste-images/core";
import { type TaskChainCard } from "../../core/task-chain-types";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { createTaskChain } from "../../core/endpoints";
import { withNotifyBatch } from "@plugins/framework/plugins/server-core/core";
import { armTaskAutoStart } from "./arm-auto-start";
import { rewireDependencies } from "./rewire-dependencies";

export const handleCreateChain = implement(createTaskChain, async ({ body }) => {
  // Single parentId source — server does not care which target kind it came from.
  const parentId =
    body.target.kind === "metaTask"
      ? body.target.metaTaskId
      : body.target.parentTaskId;

  // Verify the parent exists. For "child" targets we also need it later to
  // inline its title/description if any head card has includeParentTask.
  const parentTask = await getTask(parentId);
  if (!parentTask) {
    throw new HttpError(400, `parent task ${parentId} not found`);
  }

  // Verify relate.taskId exists upfront so we don't half-create the chain
  // before discovering it's invalid.
  if (body.relate) {
    const rel = await getTask(body.relate.taskId);
    if (!rel) {
      throw new HttpError(400, `relate task ${body.relate.taskId} not found`);
    }
  }

  if (body.relate?.mode === "followup" && body.relate.insertBefore?.length) {
    for (const depId of body.relate.insertBefore) {
      const dep = await getTask(depId);
      if (!dep) {
        throw new HttpError(400, `insertBefore: task ${depId} not found`);
      }
      if (!dep.dependencies.includes(body.relate.taskId)) {
        throw new HttpError(
          400,
          `insertBefore: task ${depId} does not depend on ${body.relate.taskId}`,
        );
      }
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
        throw new HttpError(400, `card ${i}: attachment ${id} not found`);
      }
      resolved.push(row);
    }
    cardAttachments.push(resolved);
  }

  const author = body.target.kind === "metaTask" ? "improve-plugin" : "user";
  const groupId = body.relate ? body.relate.taskId : null;
  const taskIds: string[] = [];

  await withNotifyBatch(async () => {
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
        groupId,
        title: fallbackTitle,
        description,
        author,
      });
      scheduleTaskTitleUpdate(newTask.id, card.text, fallbackTitle);
      taskIds.push(newTask.id);

      if (attachments.length > 0) {
        await taskAttachments.add(newTask.id, attachments.map((a) => a.id));
      }

      if (isHead && body.relate) {
        const selective =
          body.relate.mode === "followup" && body.relate.insertBefore
            ? body.relate.insertBefore
            : undefined;
        await rewireDependencies({
          newTaskId: newTask.id,
          targetId: body.relate.taskId,
          relation: body.relate.mode,
          selectiveInsertBefore: selective,
          standalone: body.relate.standalone,
        });
      }
      if (!isHead && card.linkedToPrev !== false) {
        await addTaskDependency(newTask.id, taskIds[i - 1]!);
      }

      if (card.launch !== null) {
        let depsForAutoStart: string[];
        if (isHead && body.relate?.mode === "followup") {
          depsForAutoStart = [body.relate.taskId];
        } else if (isHead && body.relate?.mode === "prerequisite") {
          depsForAutoStart = await getTaskDependencyIds(newTask.id);
        } else if (!isHead && card.linkedToPrev !== false) {
          depsForAutoStart = [taskIds[i - 1]!];
        } else {
          depsForAutoStart = [];
        }
        await armTaskAutoStart({
          taskId: newTask.id,
          model: card.launch,
          dependencies: depsForAutoStart,
        });
      }
    }
  });

  return { taskIds };
});

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
