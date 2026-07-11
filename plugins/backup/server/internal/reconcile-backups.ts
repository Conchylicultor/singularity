import { readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { and, isNull, lt } from "drizzle-orm";
import { BACKUPS_DIR } from "@plugins/infra/plugins/paths/server";
import { db } from "@plugins/database/server";
import { _backupRuns } from "./tables";

const TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/;

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    return false;
  }
}

/**
 * Boot-time reconcile of interrupted backups. A server restart mid-run (deploy,
 * sleep) can leave a truncated `archive.tar.gz` plus an orphaned ~GB `staging/`
 * dir that survives forever, corrupts retention, and strands the DB row at
 * `status='running'`. This sweeps the filesystem and marks stuck rows failed.
 *
 * Host-global BACKUPS_DIR + main-only lifecycle: callers gate on isMain().
 */
export async function reconcileBackups(): Promise<void> {
  // Capture before any DB write so the cutoff excludes only pre-existing runs.
  const cutoff = new Date();

  // (a) Filesystem sweep.
  let entries: string[];
  try {
    entries = await readdir(BACKUPS_DIR);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    entries = [];
  }

  for (const entry of entries) {
    if (!TIMESTAMP_RE.test(entry)) continue;

    const runDir = join(BACKUPS_DIR, entry);
    const archivePath = join(runDir, "archive.tar.gz");
    const stagingDir = join(runDir, "staging");
    const partialPath = `${archivePath}.partial`;

    const hasArchive = await exists(archivePath);
    const hasStaging = await exists(stagingDir);
    const hasPartial = await exists(partialPath);

    // Fast path: a clean completed backup — no gzip cost in steady state.
    if (hasArchive && !hasStaging && !hasPartial) continue;

    if (hasArchive) {
      // An archive exists but leftovers linger — validate it before trusting it.
      const proc = Bun.spawn(["gzip", "-t", archivePath], { stderr: "pipe" });
      const valid = (await proc.exited) === 0;
      if (valid) {
        // Good archive with defensive leftovers: drop staging + partial, keep it.
        await rm(stagingDir, { recursive: true, force: true });
        await rm(partialPath, { force: true });
        continue;
      }
    }

    // No archive, or a corrupt/truncated one: the run was interrupted — drop it.
    await rm(runDir, { recursive: true, force: true });
  }

  // (b) DB reconcile: any run whose process died before writing finishedAt.
  await db
    .update(_backupRuns)
    .set({
      status: "failed",
      finishedAt: new Date(),
      targetResults: [
        {
          targetId: "reconcile",
          ok: false,
          detail: "Backup interrupted — the server was restarted mid-run.",
        },
      ],
    })
    .where(and(isNull(_backupRuns.finishedAt), lt(_backupRuns.startedAt, cutoff)));
}
