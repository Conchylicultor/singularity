import { defineWarmup } from "@plugins/infra/plugins/warmup/server";
import { listArmedTaskIds } from "@plugins/tasks/plugins/auto-start/server";
import { maybeLaunchTaskJob } from "@plugins/conversations/server";

// Wake the launcher once for every armed task at boot.
//
// The status event is what normally wakes a launch, and it is forward-only: no
// future event will ever name a task that was already stranded — armed,
// unblocked, and never told to look — when the event was still unreliable. This
// warm-up is the catch-up for that backlog, and the standing net for the one
// hole the event cannot close, a status-source write made from outside
// TypeScript (a migration, a hand-run psql).
//
// It deliberately re-derives NOTHING. `maybeLaunchTaskJob` is already the
// single gate (dropped/held → bail, no marker → bail, blocked → bail, claim,
// existing attempt → bail); a "launchable" pre-filter here would be a second
// copy of that gate that can drift, which is the disease this whole change
// cures. So: every armed id, unconditionally.
//
// Cost is one indexed job row per marker (~180 today), collapsed by
// maybeLaunchTaskJob's `taskId` dedup key. Host-scoped, so it runs on the main
// backend only — a worktree fork inherits the markers and would otherwise
// launch a parallel agent per task against its own DB.
export async function reconcileArmedTasks(): Promise<void> {
  const ids = await listArmedTaskIds();
  await Promise.all(
    ids.map((taskId) =>
      maybeLaunchTaskJob.enqueue({ taskId, cause: "boot-reconcile" }),
    ),
  );
}

export const autoStartReconcileWarmup = defineWarmup({
  name: "tasks.auto-start-reconcile",
  scope: "host",
  run: () => reconcileArmedTasks(),
});
