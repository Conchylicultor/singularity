import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@plugins/database/server";
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
  type Updater,
} from "../../core";

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

/** Who files an updater's tasks — the key an open task is matched by. */
function authorOf(updaterId: string): string {
  return `deps.${updaterId}`;
}

/**
 * The updater's upgrade task that has not finished: neither landed nor
 * dropped. Held and attempted-without-a-push both count as open — they are a
 * person's to look at, and filing a second task beside one would only
 * duplicate it.
 */
async function openUpgradeTaskId(updaterId: string): Promise<string | null> {
  const rows = await db
    .select({ taskId: tasksCategory.table.taskId })
    .from(tasksCategory.table)
    .where(eq(tasksCategory.table.category, DEPS_CATEGORY_ID));
  for (const { taskId } of rows) {
    const task = await getTask(taskId);
    if (
      task !== null &&
      task.author === authorOf(updaterId) &&
      task.status !== "done" &&
      task.status !== "dropped"
    )
      return task.id;
  }
  return null;
}

/** One updater's daily pass: at most one task filed. */
export async function detectOne(
  updater: Updater,
  root: string,
): Promise<string> {
  const outdated = await updater.detect(root);
  if (outdated.length === 0) return `${updater.id}: current`;
  const title = upgradeTaskTitle(updater.id, outdated);

  const open = await openUpgradeTaskId(updater.id);
  if (open !== null) return `${title}; task ${open} is still open`;

  const task = await createTask({
    title,
    titleAuto: false,
    author: authorOf(updater.id),
    description: upgradeTaskDescription({
      updaterId: updater.id,
      outdated,
      holdsFile: updater.holds.file,
    }),
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
 * Daily: for each updater with something newer than its lock records, and no
 * open task for it, file ONE auto-started task whose agent runs
 * `./singularity deps upgrade <updater>` in its own worktree.
 *
 * Detection only — it installs nothing and moves no lock. Main-only by virtue
 * of its schedule. One updater failing to detect does not stop the others; the
 * failures are thrown together at the end.
 */
export const detectOutdatedDepsJob = defineJob({
  name: "deps.detect-outdated",
  description:
    "Checks each tracked toolchain for a newer release and files an upgrade task when one is available and none is open.",
  // Each updater asks its release source over the network.
  hold: "minutes",
  inProcess:
    "A read-only detection pass (one release query per updater, then at most one task insert each) that a restart can abort and the next daily tick simply repeats; each query is bounded by its own spawn timeout.",
  input: z.object({}),
  event: z.never(),
  dedup: "singleton",
  schedule: { cron: "0 6 * * *" }, // daily at 06:00 UTC
  async run() {
    const failures: unknown[] = [];
    for (const updater of declaredUpdaters()) {
      try {
        log.publish(`deps outdated: ${await detectOne(updater, REPO_ROOT)}`);
      } catch (err) {
        failures.push(err);
      }
    }
    if (failures.length > 0) {
      throw new AggregateError(
        failures,
        `deps.detect-outdated: ${failures.length} updater(s) failed to detect`,
      );
    }
  },
});
