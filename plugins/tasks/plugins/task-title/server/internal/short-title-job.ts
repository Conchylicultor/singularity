import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import { _tasks } from "@plugins/tasks/plugins/tasks-core/server";
import { generateShortTitle } from "./generate-title";
import { tasksShortTitle } from "./tables";

// How long a title must stay put before it is shortened. A task created with a
// fallback title that Haiku upgrades a few seconds later emits two
// `tasks.titleChanged`; the keyed row below is pushed back by each, so only the
// settled title costs a model call.
const SETTLE_MS = 10_000;

// Makes (or refreshes) one task's short title from its CURRENT title. Keyed on
// the task: graphile replaces a still-pending row's run time, so rapid renames
// coalesce into one run. `serial` keeps it to one model call at a time — the
// backfill enqueues a batch of these, and they would otherwise all hit the CLI
// at once.
export const shortTitleJob = defineJob({
  name: "task-title.short",
  // seconds: one Haiku call bounded by its own 30 s timeout.
  hold: "seconds",
  input: z.object({ taskId: z.string() }),
  event: z.never(),
  dedup: { key: ({ taskId }) => taskId },
  serial: true,
  maxAttempts: 2,
  run: async ({ input: { taskId } }) => {
    const [task] = await db
      .select({ title: _tasks.title })
      .from(_tasks)
      .where(eq(_tasks.id, taskId))
      .limit(1);
    if (!task) return; // deleted since — the extension row cascaded with it
    const title = task.title;
    const existing = await tasksShortTitle.get(taskId);
    if (existing?.sourceTitle === title) return; // already fresh

    const result = await generateShortTitle(title, taskId);
    if (!result.ok) {
      // An unusable answer writes nothing: the full title keeps showing.
      console.warn(
        `[task-title] short title for ${taskId} rejected: ${result.reason}`,
      );
      return;
    }
    // Persist only if the title is still the one we shortened. The row lock
    // orders this against a concurrent rename; a rename that wins has its own
    // event, and so its own run, on the way.
    await db.transaction(async (tx) => {
      const [current] = await tx
        .select({ title: _tasks.title })
        .from(_tasks)
        .where(eq(_tasks.id, taskId))
        .for("update");
      if (current?.title !== title) return;
      await tasksShortTitle.upsert(
        taskId,
        { shortTitle: result.shortTitle, sourceTitle: title },
        tx,
      );
    });
  },
});

// Subscriber of `tasks.titleChanged`. A trigger's job input is the trigger's
// constant `with`, so the subscriber itself cannot be keyed per task: it only
// hands the task to the keyed job above, delayed by the settle window.
export const shortTitleOnTitleChangedJob = defineJob({
  name: "task-title.short-on-title-changed",
  // instant: one queue insert.
  hold: "instant",
  input: z.object({}).passthrough(),
  dedup: "none",
  event: z.object({ taskId: z.string() }).passthrough(),
  maxAttempts: 2,
  run: async ({ event }) => {
    if (!event) return;
    await shortTitleJob.enqueue(
      { taskId: event.taskId },
      { runAt: new Date(Date.now() + SETTLE_MS) },
    );
  },
});

/** Enqueue a short-title run for each task, due now (the backfill). */
export async function enqueueShortTitles(taskIds: readonly string[]) {
  for (const taskId of taskIds) await shortTitleJob.enqueue({ taskId });
}
