import { z } from "zod";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import { getConfig } from "@plugins/config_v2/server";
import { backupConfig } from "../../shared/config";
import { backupRunJob } from "./backup-job";

/**
 * The nightly tick that asks for a backup.
 *
 * A separate job from {@link backupRunJob}, and it has to be: `defineJob`'s spec
 * is a union in which declaring `schedule` narrows `dedup` to `"singleton"`,
 * while every supervised job is fixed at `dedup: "none"`. That is not a
 * collision to route around — both halves are load-bearing. graphile's cron path
 * hardcodes the singleton job key `${name}:_`, so a scheduled job with any other
 * dedup inserts a fresh row every tick (57 copies of six monitors is how main's
 * queue wedged once); and a supervised job with `dedup: "singleton"` would reuse
 * that same constant as its `workflowRunId`, so one failed run's cached steps
 * and resolved wait would be replayed by every later run — it would skip the
 * spawn and never back up again.
 *
 * So the tick is a singleton and the run is not, and the two are joined by an
 * enqueue. Overlap is not this job's problem either way: the claiming INSERT on
 * `backup_runs_inflight_uniq` is the lock, so a tick that fires while a backup
 * is still running claims nothing and returns.
 *
 * `instant`: one enqueue.
 */
export const backupScheduleJob = defineJob({
  name: "backup.run.schedule",
  hold: "instant",
  // The cron payload is `input.parse({})`, so every field must be defaulted.
  input: z.object({}),
  event: z.never(),
  dedup: "singleton",
  schedule: {
    // Recur on the user-configured cron; empty disables. Read once at worker
    // startup (a change takes effect on the next restart). Main-only, because
    // `perWorktree` is left off: `BACKUPS_DIR` is host-global, and one tick per
    // live worktree would mean N archives and N uploads of the same machine.
    cron: () => getConfig(backupConfig).periodicCron.trim() || null,
  },
  run: async () => {
    await backupRunJob.enqueue({ trigger: "periodic" });
  },
});
