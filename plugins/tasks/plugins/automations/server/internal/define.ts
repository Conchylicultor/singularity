import { z } from "zod";
import type { Registration } from "@plugins/framework/plugins/server-core/core";
import { getConfig } from "@plugins/config_v2/server";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import { defineWarmup } from "@plugins/infra/plugins/warmup/server";
import { Log } from "@plugins/primitives/plugins/log-channels/server";
import { armTaskAutoStart } from "@plugins/tasks/server";
import { automationsConfig } from "../../shared/config";
import {
  includedSources,
  resolveAutomationSettings,
} from "../../shared/settings";
import { automationsCatalogServed } from "./live";
import {
  adoptAutomationTasks,
  fileAutomationTask,
  openAutomationTaskId,
} from "./origin";
import { addAutomation, type AutomationSpec } from "./registry";

const log = Log.channel("automations");

/** A declared automation: mount it in the plugin's `register: [...]`. */
export interface Automation extends Registration {
  readonly id: string;
  /** The job it owns (`automation.<id>`) — its Background activity entry. */
  readonly jobName: string;
}

/** What one run did — the line it logs. */
async function runAutomation(
  spec: AutomationSpec,
  signal: AbortSignal,
): Promise<string> {
  const settings = resolveAutomationSettings(
    getConfig(automationsConfig).settings,
    spec.id,
    spec.defaults,
  );
  if (!settings.enabled) return "disabled; nothing filed";

  if (spec.adoptLegacy) await adoptLegacy(spec);
  const open = await openAutomationTaskId(spec.id);
  if (open !== null) return `task ${open} is still open; nothing filed`;

  const failures: unknown[] = [];
  const filing = await spec.detect({
    sources: includedSources(spec.sources?.() ?? [], settings),
    settings,
    signal,
    partialFailure: (err) => failures.push(err),
  });

  let outcome = "nothing to do";
  if (filing !== null) {
    const taskId = await fileAutomationTask({
      automationId: spec.id,
      categoryId: spec.categoryId,
      filing,
    });
    automationsCatalogServed.notify();
    await armTaskAutoStart({
      taskId,
      model: settings.model,
      cause: `automation:${spec.id}`,
    });
    outcome = `${filing.title}; filed auto-started task ${taskId}`;
  }
  if (failures.length > 0) {
    log.publish(`automation ${spec.id}: ${outcome}`);
    throw new AggregateError(
      failures,
      `automation ${spec.id}: ${failures.length} source(s) failed to detect`,
    );
  }
  return outcome;
}

async function adoptLegacy(spec: AutomationSpec): Promise<void> {
  if (!spec.adoptLegacy) return;
  const adopted = await adoptAutomationTasks(spec.id, await spec.adoptLegacy());
  if (adopted > 0) {
    log.publish(`automation ${spec.id}: adopted ${adopted} legacy task(s)`);
    automationsCatalogServed.notify();
  }
}

/**
 * Declare an automation. It owns its job (`automation.<id>`, singleton, on the
 * declared schedule), whose every run resolves the settings, files nothing
 * while disabled or while a task it filed is open, asks `detect` over the
 * included sources, then files ONE task (category + origin row, one
 * transaction) and arms its launch with the chosen model.
 *
 * ```ts
 * export const depsUpgradesAutomation = defineAutomation({
 *   id: "deps-upgrades", label: "Dependency upgrades", icon: symbol("upgrade"),
 *   description, categoryId: DEPS_CATEGORY_ID, schedule: { cron: () => … },
 *   inProcess: "…", sources: () => …, defaults: { … },
 *   detect: async ({ sources, settings }) => … ?? null,
 * });
 * // register: [depsUpgradesAutomation]
 * ```
 */
export function defineAutomation(spec: AutomationSpec): Automation {
  const jobName = `automation.${spec.id}`;
  const job = defineJob({
    name: jobName,
    description: spec.description,
    hold: "minutes",
    inProcess: spec.inProcess,
    input: z.object({}),
    event: z.never(),
    dedup: "singleton",
    schedule: { cron: spec.schedule.cron },
    async run({ ctx }) {
      log.publish(
        `automation ${spec.id}: ${await runAutomation(spec, ctx.signal)}`,
      );
    },
  });
  const adoptWarmup = spec.adoptLegacy
    ? defineWarmup({
        name: `${jobName}.adopt-legacy`,
        description: `Records the tasks "${spec.label}" filed before automations stored where a task came from.`,
        scope: "worktree",
        run: () => adoptLegacy(spec),
      })
    : null;

  return {
    id: spec.id,
    jobName,
    _kind: "automation",
    _factory: "defineAutomation",
    _doc: { label: spec.id, detail: spec.description },
    async register() {
      addAutomation({ spec, jobName });
      await job.register();
      if (adoptWarmup !== null) await adoptWarmup.register();
    },
  };
}
