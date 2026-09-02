import { z } from "zod";
import { defineSupervisedJob } from "@plugins/infra/plugins/jobs/plugins/supervised-job/server";
import { BACKUP_RUN_KIND } from "@plugins/backup/core";
import { backupLog } from "./backup-log";
import { backupTask } from "./backup-task";
import {
  claimBackupRun,
  closeBackupRow,
  listUnfinishedBackups,
  setBackupPid,
} from "./run-state";

/**
 * One backup, as an ordinary durable job whose body runs in its own process.
 *
 * The handler claims this namespace's single in-flight slot, spawns
 * `./singularity supervised-exec backup.run` detached, and SUSPENDS — it holds a
 * worker slot for milliseconds, not for the length of a `pg_dump` fan-out plus a
 * `tar` plus a Drive upload. Whichever backend is alive when the child's exit
 * marker lands is the one that wakes and records the outcome.
 *
 * **This is what makes a backup survive a restart**, which it never did before:
 * the work is no longer inside the process the deploy, the sleep or the crash
 * takes down. The old boot-time "mark every unfinished row failed" sweep is
 * gone with it — after this change, an unfinished row at boot usually means a
 * backup that is still running.
 *
 * `runAttempts: 2` **preserves what this job already had**, and is not an opt-in
 * to something new: the old `defineJob` carried `maxAttempts: 2`, whose retry
 * re-ran the whole handler body — assemble from scratch, upload from scratch —
 * which is exactly what a second spawn does. The default is 1 everywhere else
 * because build, release and deploy never retried; backup did.
 *
 * It also earns its keep here in a way it would not for the others. A backup's
 * likeliest failure is the upload leg, a network blip reaching Drive, which is
 * the transient class a retry is for — and the fallback if we dropped it is the
 * nightly schedule, so one failure would mean no backup for a whole day.
 */
export const backupRunJob = defineSupervisedJob({
  name: "backup.run.supervised",
  input: z.object({
    // Defaulted so a caller that carries no input runs as "periodic".
    trigger: z.enum(["manual", "periodic"]).default("periodic"),
  }),

  kind: {
    id: BACKUP_RUN_KIND,
    channel: backupLog,
    listUnfinished: listUnfinishedBackups,
    setPid: setBackupPid,
    // The bare terminal stamp for a row the child never closed, and nothing
    // else. There is no `onReattach`: a backup keeps no in-memory live view —
    // its UI reads the ledger row, and the primitive has already restarted the
    // transcript tail by the time `onReattach` would be called.
    closeRow: closeBackupRow,
  },

  claim: (input) => claimBackupRun(input.trigger),

  // The `task` arm rather than `argv`: a backup has no command line of its own.
  // `invoke` is the only producer of an invocation, so the id in the spawned
  // argv is a registered id by construction and the payload is checked against
  // the task's own schema right here.
  task: (input, runId) => backupTask.invoke({ runId, trigger: input.trigger }),

  // Nothing. A backup's terminal work is entirely the row it writes, and the
  // child writes that itself as its last act — there is no notification, no
  // downstream reconcile, nothing outside the archive that a finished backup
  // changes. `closeRow` covers the case where the child never got that far.
  //
  // Left as an explicit empty body rather than an optional field: `onEnded` is
  // where a kind's exactly-once side effects go, and "this kind has none" is
  // worth stating once here instead of being inferred from an absent key.
  //
  // In particular the manifest, the archive size and the per-target results are
  // NOT written here, and cannot be: they are produced inside the child, and the
  // only channel back to the parent is the database the child is already writing
  // to. So the child writes them, and this arm has nothing left to do.
  onEnded: async () => {},

  // Two spawns at most, each a genuinely fresh run: `spawn` calls `claim` again,
  // so attempt 2 gets a new uuid, a new transcript and a new marker, and it can
  // claim at all only because attempt 1's row is closed before the handler wakes.
  runAttempts: 2,
});
