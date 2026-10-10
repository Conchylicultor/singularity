import {
  serveCollection,
  serveValue,
} from "@plugins/network/plugins/live/server";
import {
  automationsCatalog,
  automationTasks,
  cadenceWords,
  PUSH_POLICY_VARIABLE,
  type AutomationEntry,
  type AutomationSettings,
  type AutomationTrigger,
} from "../../core";
import { getConfig } from "@plugins/config_v2/server";
import {
  occupiedSlotTaskIdsByAutomation,
  openAutomationTaskIds,
} from "./origin";
import { registeredAutomations, type AutomationSpec } from "./registry";
import { automationCron, automationSettings } from "./settings";
import { tasksOrigin } from "./tables";

function triggerOf(
  spec: AutomationSpec,
  jobName: string,
  settings: AutomationSettings,
): AutomationTrigger {
  const { cron, error } = automationCron(spec);
  const eventLabel =
    "eventLabel" in spec.triggers ? spec.triggers.eventLabel : null;
  return {
    kinds: [...spec.triggers.kinds],
    current: settings.trigger,
    words:
      settings.trigger === "event"
        ? (eventLabel ?? "On its event")
        : cadenceWords(settings.schedule),
    eventLabel,
    jobName,
    cron,
    scheduleError: error,
  };
}

async function loadCatalog(): Promise<AutomationEntry[]> {
  const [open, running] = await Promise.all([
    openAutomationTaskIds(),
    occupiedSlotTaskIdsByAutomation(),
  ]);
  return registeredAutomations().map(({ spec, jobName }) => {
    const settings = automationSettings(spec);
    const common = {
      id: spec.id,
      label: spec.label,
      icon: spec.icon,
      description: spec.description,
      enabled: settings.enabled,
      trigger: triggerOf(spec, jobName, settings),
      sources: spec.sources?.() ?? [],
      promptVariables: [...spec.promptVariables, PUSH_POLICY_VARIABLE],
    };
    return spec.kind === "launch"
      ? {
          ...common,
          kind: "launch" as const,
          concurrency: getConfig(spec.config).concurrency,
          runningTaskIds: running.get(spec.id) ?? [],
        }
      : {
          ...common,
          kind: "file" as const,
          categoryId: spec.categoryId,
          openTaskId: open.get(spec.id) ?? null,
        };
  });
}

/**
 * The catalog, pushed. External: the declarations are process state, the
 * installed schedule and the concurrency move when an automation's config
 * changes, and the DB-derived fields (`openTaskId`, `runningTaskIds`) move only
 * when an automation files, launches or releases a task or one of its tasks
 * changes status — each says so (`notify`). Bounded by the declared set.
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
