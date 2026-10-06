import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@plugins/database/server";
import { getConfig } from "@plugins/config_v2/server";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import { REPO_ROOT } from "@plugins/infra/plugins/paths/core";
import { defineServerContribution } from "@plugins/framework/plugins/server-core/core";
import { Log } from "@plugins/primitives/plugins/log-channels/server";
import { createTask, getTask } from "@plugins/tasks/plugins/tasks-core/server";
import {
  setTaskCategory,
  tasksCategory,
} from "@plugins/tasks/plugins/task-category/server";
import { armTaskAutoStart } from "@plugins/tasks/server";
import { DEFAULT_MODEL_CHOICE } from "@plugins/conversations/plugins/model-provider/core";
import {
  upgradeTaskDescription,
  upgradeTaskTitle,
  type OutdatedUpdater,
  type Updater,
} from "../../core";
import { depsUpdatesConfig } from "../../shared/config";

const log = Log.channel("deps-updates");

/** The task category every upgrade task is filed under. */
export const DEPS_CATEGORY_ID = "dependencies";

/**
 * The set of updaters: each lists `UpdaterDeclare({ updater })` in its server
 * `contributions`. The detect job and `./singularity deps upgrade` read only
 * this generic set.
 */
export const UpdaterDeclare = defineServerContribution<{ updater: Updater }>(
  "updater",
  { docLabel: (c) => c.updater.id },
);

/** Every declared updater. */
export function declaredUpdaters(): Updater[] {
  return UpdaterDeclare.getContributions().map((c) => c.updater);
}

/** Who files the batched upgrade task — the key an open task is matched by. */
const AUTHOR = "deps.upgrade";

/**
 * An upgrade task that has not finished: neither landed nor dropped. Held and
 * attempted-without-a-push both count as open — they are a person's to look
 * at, and filing a second task beside one would only duplicate it. Matches the
 * per-updater tasks filed before upgrades were batched (`deps.<updater>`) too.
 */
async function openUpgradeTaskId(): Promise<string | null> {
  const rows = await db
    .select({ taskId: tasksCategory.table.taskId })
    .from(tasksCategory.table)
    .where(eq(tasksCategory.table.category, DEPS_CATEGORY_ID));
  for (const { taskId } of rows) {
    const task = await getTask(taskId);
    if (
      task !== null &&
      task.author !== null &&
      task.author.startsWith("deps.") &&
      task.status !== "done" &&
      task.status !== "dropped"
    )
      return task.id;
  }
  return null;
}

/** One pass: at most one task filed, covering every outdated updater. */
export async function fileUpgradeTask(
  batch: readonly OutdatedUpdater[],
): Promise<string> {
  if (batch.length === 0) return "everything current";
  const title = upgradeTaskTitle(batch);

  const open = await openUpgradeTaskId();
  if (open !== null) return `${title}; task ${open} is still open`;

  const task = await createTask({
    title,
    titleAuto: false,
    author: AUTHOR,
    description: upgradeTaskDescription(batch),
  });
  await setTaskCategory(task.id, DEPS_CATEGORY_ID);
  await armTaskAutoStart({
    taskId: task.id,
    model: DEFAULT_MODEL_CHOICE,
    cause: "deps-outdated",
  });
  return `${title}; filed auto-started task ${task.id}`;
}

/**
 * On the configured schedule (weekly by default): ask every updater what is
 * newer than its lock records and, when anything is and no upgrade task is
 * open, file ONE auto-started task covering all of it, whose agent runs
 * `./singularity deps upgrade` (every updater at once) in its own worktree.
 *
 * Detection only — it installs nothing and moves no lock. Main-only by virtue
 * of its schedule. One updater failing to detect does not stop the others —
 * the task still covers the ones that answered; the failures are thrown
 * together at the end.
 */
export const detectOutdatedDepsJob = defineJob({
  name: "deps.detect-outdated",
  description:
    "Checks each tracked toolchain for a newer release and files one upgrade task covering every outdated one when none is open.",
  // Each updater asks its release source over the network.
  hold: "minutes",
  inProcess:
    "A read-only detection pass (one release query per updater, then at most one task insert) that a restart can abort and the next scheduled tick simply repeats; each query is bounded by its own spawn timeout.",
  input: z.object({}),
  event: z.never(),
  dedup: "singleton",
  // The user-configured cron; empty disables. Read once at worker startup (a
  // change takes effect on the next restart).
  schedule: {
    cron: () => getConfig(depsUpdatesConfig).detectCron.trim() || null,
  },
  async run() {
    const failures: unknown[] = [];
    const batch: OutdatedUpdater[] = [];
    for (const updater of declaredUpdaters()) {
      try {
        const outdated = await updater.detect(REPO_ROOT);
        if (outdated.length > 0)
          batch.push({
            updaterId: updater.id,
            outdated,
            holdsFile: updater.holds.file,
          });
      } catch (err) {
        failures.push(err);
      }
    }
    log.publish(`deps outdated: ${await fileUpgradeTask(batch)}`);
    if (failures.length > 0) {
      throw new AggregateError(
        failures,
        `deps.detect-outdated: ${failures.length} updater(s) failed to detect`,
      );
    }
  },
});
