import {
  serveCollection,
  serveValue,
} from "@plugins/network/plugins/live/server";
import {
  listRegisteredJobs,
  resolveJobCron,
} from "@plugins/infra/plugins/jobs/server";
import {
  automationsCatalog,
  automationTasks,
  type AutomationEntry,
} from "../../core";
import { openAutomationTaskIds } from "./origin";
import { registeredAutomations } from "./registry";
import { tasksOrigin } from "./tables";

/** The schedule a registered job resolves to now — the one reading the cron
 * install uses too. Throws for a job this backend did not register. */
function jobCron(jobName: string): string | null {
  const job = listRegisteredJobs().find((j) => j.name === jobName);
  if (job === undefined) {
    throw new Error(
      `[automations] job "${jobName}" is not registered — an automation registers its own job`,
    );
  }
  return resolveJobCron(job);
}

async function loadCatalog(): Promise<AutomationEntry[]> {
  const open = await openAutomationTaskIds();
  return registeredAutomations().map(({ spec, jobName }) => ({
    id: spec.id,
    label: spec.label,
    icon: spec.icon,
    description: spec.description,
    categoryId: spec.categoryId,
    trigger: { kind: "schedule", jobName, cron: jobCron(jobName) },
    sources: spec.sources?.() ?? [],
    defaults: spec.defaults,
    openTaskId: open.get(spec.id) ?? null,
  }));
}

/**
 * The catalog, pushed. External: the declarations are process state, and the
 * one DB-derived field (`openTaskId`) moves only when an automation files a
 * task or one of its tasks changes status — both say so (`notify`). Bounded by
 * the declared set.
 */
export const automationsCatalogServed = serveValue(automationsCatalog, {
  source: "external",
  loader: loadCatalog,
  throttleMs: 1000,
});

// Served from the extension handle: `taskId` is the `parent_id` PK, the
// projection is exactly the row schema. Filing a task is a window entry;
// a task's deletion cascades its row away (an exit).
export const automationTasksServed = serveCollection(automationTasks, {
  from: tasksOrigin,
});
