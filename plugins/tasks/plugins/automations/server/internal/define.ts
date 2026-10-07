import { z } from "zod";
import type { Registration } from "@plugins/framework/plugins/server-core/core";
import { getConfig } from "@plugins/config_v2/server";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import { defineWarmup } from "@plugins/infra/plugins/warmup/server";
import { isMain } from "@plugins/infra/plugins/runtime-identity/core";
import { Log } from "@plugins/primitives/plugins/log-channels/server";
import { armTaskAutoStart } from "@plugins/tasks/server";
import {
  PUSH_POLICY_TEXT,
  renderPrompt,
  SETTLE_MAX_WAIT_FACTOR,
  type AutomationConfigFields,
} from "../../core";
import { automationsCatalogServed } from "./live";
import {
  adoptAutomationTasks,
  fileAutomationTask,
  openAutomationTaskId,
} from "./origin";
import { addAutomation, type AutomationSpec } from "./registry";
import {
  automationCron,
  automationSettings,
  includedSources,
} from "./settings";

const log = Log.channel("automations");

// A burst re-enqueues the pending run at most this often: each event pushes the
// run's start later, but moving it by less than this is not worth a queue write.
const RESCHEDULE_GRANULARITY_MS = 30_000;

/** A declared automation: mount it in the plugin's `register: [...]`. */
export interface Automation extends Registration {
  readonly id: string;
  /** The job it owns (`automation.<id>`) — its Background activity entry. */
  readonly jobName: string;
  /**
   * Its event happened. While it is on and set to its event, this schedules a
   * run `settleMinutes` after the LAST event of a burst (at most 6× that after
   * the first), so a burst becomes one run. Cheap and synchronous — call it
   * from the hot path that sees the event. Main only: a worktree backend's
   * events file nothing.
   */
  fire(): void;
}

/** What one run did — the line it logs. */
async function runAutomation(
  spec: AutomationSpec,
  signal: AbortSignal,
): Promise<string> {
  const settings = automationSettings(spec);
  if (!settings.enabled) return "disabled; nothing filed";

  if (spec.adoptLegacy) await adoptLegacy(spec);
  const open = await openAutomationTaskId(spec.id);
  if (open !== null) return `task ${open} is still open; nothing filed`;

  const failures: unknown[] = [];
  const filing = await spec.detect({
    sources: includedSources(spec.sources?.() ?? [], settings),
    settings,
    config: getConfig(spec.config),
    signal,
    partialFailure: (err) => failures.push(err),
  });

  let outcome = "nothing to do";
  if (filing !== null) {
    const prompt = renderPrompt(settings.prompt, {
      ...filing.variables,
      pushPolicy: PUSH_POLICY_TEXT[settings.push],
    });
    if (!prompt.ok) {
      // The pane refuses such a template; this is a hand edit. File nothing
      // rather than a task with a hole where its evidence was.
      throw new Error(
        `automation ${spec.id}: its prompt template uses ${prompt.unknown.map((n) => `{{${n}}}`).join(", ")}, which it does not fill — fix the prompt in its config`,
      );
    }
    const taskId = await fileAutomationTask({
      automationId: spec.id,
      categoryId: spec.categoryId,
      filing,
      description: prompt.text,
    });
    automationsCatalogServed.notify();
    if (filing.onFiled) await filing.onFiled(taskId);
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
 * Declare an automation. It owns its job (`automation.<id>`, singleton), which
 * runs on the schedule its config sets — re-installed live when the config
 * changes — or, set to its event, when the handle's `fire()` says so, once the
 * burst settles. Every run reads the config, files nothing while disabled or
 * while a task it filed is open, asks `detect` over the included sources, fills
 * the config's prompt template, then files ONE task (category + origin row, one
 * transaction) and arms its launch with the chosen model.
 *
 * ```ts
 * export const depsUpgradesConfig = defineAutomationConfig("deps-upgrades", { … });
 * export const depsUpgradesAutomation = defineAutomation({
 *   id: "deps-upgrades", label: "Dependency upgrades", icon: symbol("upgrade"),
 *   description, categoryId: DEPS_CATEGORY_ID, config: depsUpgradesConfig,
 *   triggers: { kinds: ["schedule"] }, inProcess: "…",
 *   sources: () => …, promptVariables: [{ name: "outdated", description: "…" }],
 *   detect: async ({ sources, settings }) => … ?? null,
 * });
 * // register: [depsUpgradesAutomation]
 * ```
 */
export function defineAutomation<F extends AutomationConfigFields>(
  spec: AutomationSpec<F>,
): Automation {
  // The registry holds every automation at the common shape; `detect` is a
  // method, so its context parameter is read bivariantly there.
  const common: AutomationSpec = spec;
  const jobName = `automation.${spec.id}`;

  // The pending event-triggered run: when its burst began, and the start it
  // was last queued for. Process state — a restart forgets a burst's start,
  // which only lets that one burst wait a little longer.
  let burstStartedAt: number | null = null;
  let queuedRunAt: number | null = null;

  const job = defineJob({
    name: jobName,
    description: spec.description,
    hold: "minutes",
    inProcess: spec.inProcess,
    input: z.object({}),
    event: z.never(),
    dedup: "singleton",
    schedule: { cron: () => automationCron(common).cron },
    async run({ ctx }) {
      burstStartedAt = null;
      queuedRunAt = null;
      log.publish(
        `automation ${spec.id}: ${await runAutomation(common, ctx.signal)}`,
      );
    },
  });
  const adoptWarmup = spec.adoptLegacy
    ? defineWarmup({
        name: `${jobName}.adopt-legacy`,
        description: `Records the tasks "${spec.label}" filed before automations stored where a task came from.`,
        scope: "worktree",
        run: () => adoptLegacy(common),
      })
    : null;

  return {
    id: spec.id,
    jobName,
    _kind: "automation",
    _factory: "defineAutomation",
    _doc: { label: spec.id, detail: spec.description },
    fire() {
      if (!isMain()) return;
      const settings = automationSettings(common);
      if (!settings.enabled || settings.trigger !== "event") return;
      const now = Date.now();
      const settleMs = settings.settleMinutes * 60_000;
      burstStartedAt ??= now;
      const runAt = Math.min(
        now + settleMs,
        burstStartedAt + settleMs * SETTLE_MAX_WAIT_FACTOR,
      );
      if (
        queuedRunAt !== null &&
        Math.abs(runAt - queuedRunAt) < RESCHEDULE_GRANULARITY_MS
      ) {
        return;
      }
      queuedRunAt = runAt;
      // The singleton key collapses every enqueue onto the one pending row,
      // and graphile's default key mode moves its run_at to the new start.
      void job.enqueue({}, { runAt: new Date(runAt) });
    },
    async register() {
      addAutomation({ spec: common, jobName });
      await job.register();
      if (adoptWarmup !== null) await adoptWarmup.register();
    },
  };
}
