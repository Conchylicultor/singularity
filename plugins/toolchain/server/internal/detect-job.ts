import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@plugins/database/server";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import { getWorktreeRoot } from "@plugins/infra/plugins/spawn/core";
import { Log } from "@plugins/primitives/plugins/log-channels/server";
import { createTask, getTask } from "@plugins/tasks/plugins/tasks-core/server";
import {
  setTaskCategory,
  tasksCategory,
} from "@plugins/tasks/plugins/task-category/server";
import { armTaskAutoStart } from "@plugins/tasks/server";
import { DEFAULT_MODEL } from "@plugins/conversations/plugins/model-provider/core";
import {
  HOLDS,
  TOOLCHAIN_CATEGORY_ID,
  TOOLS,
  isExactRelease,
} from "@plugins/toolchain/core";
import { mise } from "../../shared/mise";
import { upgradeTaskDescription } from "./upgrade-prompt";

const log = Log.channel("toolchain");

const MINUTE = 60_000;

/** One entry of `mise outdated --json`. */
const OutdatedSchema = z.record(
  z.string(),
  z.object({ current: z.string().nullable(), latest: z.string() }),
);

/**
 * A toolchain task that has not finished: neither landed nor dropped. Held and
 * attempted-without-a-push both count as open — they are a person's to look at,
 * and filing a second task beside one would only duplicate it.
 */
async function openUpgradeTaskId(): Promise<string | null> {
  const rows = await db
    .select({ taskId: tasksCategory.table.taskId })
    .from(tasksCategory.table)
    .where(eq(tasksCategory.table.category, TOOLCHAIN_CATEGORY_ID));
  for (const { taskId } of rows) {
    const task = await getTask(taskId);
    if (task !== null && task.status !== "done" && task.status !== "dropped")
      return task.id;
  }
  return null;
}

/**
 * Daily: does main's toolchain have a newer release than `mise.lock` records?
 * If so, and no upgrade task is still open, file ONE auto-started task whose
 * agent runs `./singularity toolchain upgrade` in its own worktree.
 *
 * Detection only — it installs nothing and moves no lock. Main-only by virtue of
 * its schedule. Every outdated tool goes into the one task, so the fleet pays
 * the Bun-change dependency reinstall at most once per upgrade.
 *
 * A held latest release is not "outdated": there is nothing newer to move to
 * past it until upstream ships again.
 */
export const detectOutdatedToolchainJob = defineJob({
  name: "toolchain.detect-outdated",
  // `mise outdated` asks each tool's release source over the network.
  hold: "minutes",
  inProcess:
    "A read-only detection pass (one `mise outdated` call, then at most one task insert) that a restart can abort and the next daily tick simply repeats; it holds a slot for at most its five-minute spawn bound.",
  input: z.object({}),
  event: z.never(),
  dedup: "singleton",
  schedule: { cron: "0 6 * * *" }, // daily at 06:00 UTC
  async run() {
    const root = await getWorktreeRoot();
    const raw = await mise(root, ["outdated", "--json"], 5 * MINUTE);
    const outdated = Object.entries(OutdatedSchema.parse(JSON.parse(raw)))
      .filter(([tool]) => TOOLS.some((t) => t.name === tool))
      .filter(([, o]) => isExactRelease(o.latest))
      .filter(
        ([tool, o]) =>
          !HOLDS.some((h) => h.tool === tool && h.version === o.latest),
      )
      .map(([tool, o]) => ({
        tool,
        current: o.current ?? "(not installed)",
        latest: o.latest,
      }));
    if (outdated.length === 0) {
      log.publish("toolchain current: nothing newer than mise.lock");
      return;
    }
    const summary = outdated
      .map((o) => `${o.tool} ${o.current} → ${o.latest}`)
      .join(", ");

    const open = await openUpgradeTaskId();
    if (open !== null) {
      log.publish(
        `toolchain outdated (${summary}); upgrade task ${open} is still open`,
      );
      return;
    }

    const task = await createTask({
      title: `Upgrade toolchain: ${summary}`,
      titleAuto: false,
      author: "toolchain",
      description: upgradeTaskDescription(outdated),
    });
    await setTaskCategory(task.id, TOOLCHAIN_CATEGORY_ID);
    await armTaskAutoStart({
      taskId: task.id,
      model: DEFAULT_MODEL,
      cause: "toolchain-outdated",
    });
    log.publish(
      `toolchain outdated (${summary}); filed auto-started task ${task.id}`,
    );
  },
});
