import { z } from "zod";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import { recordNotification } from "@plugins/shell/plugins/notifications/server";
import { agentManagerApp } from "@plugins/apps/plugins/agent-manager/plugins/shell/core";
import { getTask } from "@plugins/tasks/plugins/tasks-core/server";
import { TaskStatusSchema } from "@plugins/tasks/plugins/tasks-core/core";
import { automationDetailRoute } from "../../core";
import { automationsCatalogServed } from "./live";
import { automationOfTask } from "./origin";
import { registeredAutomations } from "./registry";

// The statuses in which an automated task waits on a person: its agent asked
// something, stopped without landing, or was held.
const NEEDS_PERSON = new Set(["need_action", "attempted", "held"]);

const STATUS_WORDS: Record<string, string> = {
  need_action: "is waiting for you",
  attempted: "stopped without landing",
  held: "was held",
};

/**
 * The bell is where an automated task asks for its person: nobody watches the
 * task list for tasks they did not file. One row per task (`dedupeKey`),
 * re-surfaced on every transition into a waiting status — each is a new
 * reason to look. Every status change of an automated task also re-pushes the
 * catalog, whose `openTaskId` follows it.
 */
export const automationTaskStatusJob = defineJob({
  name: "automations.task-status",
  description:
    "Notifies you when a task an automation filed needs you, and keeps the Automations list's open task current.",
  hold: "instant",
  input: z.object({}),
  dedup: "none",
  event: z
    .object({ taskId: z.string(), status: TaskStatusSchema })
    .passthrough(),
  run: async ({ event }) => {
    if (!event) return;
    const automationId = await automationOfTask(event.taskId);
    if (automationId === null) return;
    automationsCatalogServed.notify();
    if (!NEEDS_PERSON.has(event.status)) return;

    const task = await getTask(event.taskId);
    if (task === null) return; // deleted since the emit — nothing to look at
    const automation = registeredAutomations().find(
      (a) => a.spec.id === automationId,
    );
    const label = automation?.spec.label ?? automationId;
    await recordNotification({
      type: "automation-task",
      variant: "warning",
      title: `${label}: task ${STATUS_WORDS[event.status]}`,
      description: task.title,
      linkTo: automationDetailRoute.link(agentManagerApp, { automationId }),
      metadata: { automationId, taskId: task.id, status: event.status },
      dedupeKey: `automation-task:${task.id}`,
      resurfaceAfterMs: 0,
    });
  },
});
