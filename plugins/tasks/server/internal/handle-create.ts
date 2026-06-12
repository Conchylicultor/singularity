import {
  taskAttachments,
  addTaskDependency,
  createTask,
  getTask,
} from "@plugins/tasks/plugins/tasks-core/server";
import {
  scheduleTaskTitleUpdate,
  synthesiseTitleFallback,
} from "@plugins/tasks/plugins/task-title/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { createTask as createTaskEndpoint } from "../../core/endpoints";
import { armTaskAutoStart } from "./arm-auto-start";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import { DEFAULT_MODEL } from "@plugins/conversations/plugins/model-provider/core";

export const handleCreate = implement(createTaskEndpoint, async ({ body }) => {
  const description = body.description?.trim() || null;
  const explicitTitle = body.title?.trim();
  // Use the synthesised fallback as the initial title so creation is instant;
  // Haiku then upgrades it asynchronously via scheduleTaskTitleUpdate.
  const fallbackTitle = description ? synthesiseTitleFallback(description) : null;
  const title = explicitTitle ?? fallbackTitle ?? "Untitled";
  const row = await createTask({
    folderId: body.folderId ?? null,
    title,
    // A caller-supplied title is human-authored; a synthesised fallback is not.
    titleAuto: !explicitTitle,
    description,
    author: body.author ?? "user",
    rank: body.rank ? Rank.from(body.rank) : undefined,
  });

  if (!explicitTitle && description && fallbackTitle) {
    scheduleTaskTitleUpdate(row.id, description, fallbackTitle);
  }

  if (Array.isArray(body.attachmentIds) && body.attachmentIds.length > 0) {
    await taskAttachments.set(row.id, body.attachmentIds);
  }

  const dependencies = Array.isArray(body.dependencies)
    ? Array.from(
        new Set(
          body.dependencies.filter(
            (d): d is string => typeof d === "string" && d.length > 0 && d !== row.id,
          ),
        ),
      )
    : [];

  for (const depId of dependencies) {
    try {
      await addTaskDependency(row.id, depId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Bad request";
      const status = msg.includes("not found") ? 404 : 400;
      throw new HttpError(status, msg);
    }
  }

  if (body.autoStart) {
    await armTaskAutoStart({
      taskId: row.id,
      model: body.autoStart.model ?? DEFAULT_MODEL,
      dependencies,
      cause: "user-launch",
    });
    // Re-fetch so the response reflects the autoStart columns and any
    // dependencies we just wrote.
    const fresh = await getTask(row.id);
    return fresh ?? row;
  }

  if (dependencies.length > 0) {
    const fresh = await getTask(row.id);
    return fresh ?? row;
  }

  return row;
});
