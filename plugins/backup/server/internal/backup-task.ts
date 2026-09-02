import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { defineSupervisedTask } from "@plugins/infra/plugins/jobs/plugins/supervised-task/server";
import { assembleArchive } from "./assemble-archive";
import { BackupTarget } from "./contribution";
import { _backupRuns } from "./tables";

/**
 * The backup itself, as a body that runs in its own process.
 *
 * This is the whole reason `supervised-task` exists. Build, release and deploy
 * each have a `./singularity` verb to detach; a backup is ~11 contributed
 * sources staged into a directory, one `tar`, and ~2 contributed targets — there
 * is no command line to type, so before this it was an in-process job handler
 * and a backend restart killed it mid-`tar`.
 *
 * The child boots the plugin graph in `exec` mode, which is what makes
 * `BackupSource` / `BackupTarget` contributions and the config registry present
 * here exactly as they are in the backend. Nothing is passed in but the run id
 * and what triggered it.
 *
 * **This row is claimed before the child exists** (`claimBackupRun`, in the
 * job's `claim`), so everything here is an UPDATE. The final update — the one
 * that writes `finished_at` — is the last act of the run, which is what makes a
 * still-open row at exit unambiguously mean "the process died without recording
 * anything" (see `closeBackupRow`).
 */
export const backupTask = defineSupervisedTask({
  id: "backup.run",
  payload: z.object({
    runId: z.string(),
    trigger: z.enum(["manual", "periodic"]),
  }),
  run: async ({ runId, trigger }) => {
    // The row must already exist: every UPDATE below is keyed on it, and an
    // UPDATE that matches nothing is silent. A child spawned with a run id that
    // names no row would archive gigabytes, upload them, and report success
    // into the void.
    const [row] = await db
      .select({ id: _backupRuns.id })
      .from(_backupRuns)
      .where(eq(_backupRuns.id, runId))
      .limit(1);
    if (row === undefined) {
      throw new Error(
        `[backup] no backup_runs row for ${runId} — this child was spawned with ` +
          `a run id its claim never wrote, so nothing it did could be recorded.`,
      );
    }

    let archive;
    try {
      archive = await assembleArchive(trigger);
    } catch (err) {
      await db
        .update(_backupRuns)
        .set({
          status: "failed",
          finishedAt: new Date(),
          targetResults: [
            {
              targetId: "assembler",
              ok: false,
              detail: err instanceof Error ? err.message : String(err),
            },
          ],
        })
        .where(eq(_backupRuns.id, runId));
      // Rethrown so the process exits non-zero: that status is what the shim
      // records into the exit marker, and the marker is what the supervising
      // workflow reads. The row is already stamped, so the close is a no-op.
      throw err;
    }

    const targets = BackupTarget.getContributions();
    const results = await Promise.all(
      targets.map((t) =>
        t.run(archive).catch((err) => ({
          targetId: t.id,
          ok: false as const,
          detail: err instanceof Error ? err.message : String(err),
        })),
      ),
    );

    const allOk = results.every((r) => r.ok);
    const anyOk = results.some((r) => r.ok);
    const status = allOk ? "ok" : anyOk ? "partial" : "failed";

    await db
      .update(_backupRuns)
      .set({
        status,
        finishedAt: new Date(),
        archiveSizeBytes: archive.manifest.sizeBytes,
        manifest: archive.manifest,
        targetResults: results,
      })
      .where(eq(_backupRuns.id, runId));

    // A run that reached no target at all is a failed run, and the process has
    // to say so: the ledger row is the record, but the EXIT STATUS is what the
    // runs UI, the marker and the workflow all read as the outcome. Exiting 0
    // after every upload failed would report a backup that archived nothing as
    // a success.
    if (status === "failed") {
      throw new Error(
        `[backup] every target failed: ${results
          .map((r) => `${r.targetId}: ${r.detail ?? "no detail"}`)
          .join("; ")}`,
      );
    }
  },
});
