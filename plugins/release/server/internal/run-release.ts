import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { REPO_ROOT, SINGULARITY_DIR, currentWorktreeName } from "@plugins/infra/plugins/paths/server";
import { releaseTargetById } from "../../core/targets";
import { releaseOutDir } from "./out-dir";
import { _releaseRuns } from "./tables";
import { releaseLog } from "./release-log";

// In-process re-entry guard only. The authoritative, restart-durable lock lives
// in the DB (see isAnyReleaseAlive): the detached `./singularity release` process
// outlives this backend (and the release CLI passes `--no-restart` to its nested
// build, so it does NOT restart this very backend — ownership is more stable than
// build's), but a freshly-booted backend after an unrelated restart must not
// start a second, overlapping release of the same composition.
let inflight = false;

/**
 * Whether OS process `pid` is currently alive. `process.kill(pid, 0)` sends no
 * signal; it throws ESRCH when the process is gone. EPERM means the process
 * exists but is owned by another user — still alive.
 */
export function isPidAlive(pid: number | null): boolean {
  if (pid == null) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * Durable, cross-restart release lock for a single composition: a release of
 * `composition` is in-flight iff some unfinished release_runs row for this
 * namespace + composition has a still-running owner pid. Scoped to
 * (namespace, composition) — concurrent releases of DIFFERENT compositions are
 * legitimate, unlike build's single global lock.
 */
async function isAnyReleaseAlive(composition: string): Promise<boolean> {
  const rows = await db
    .select({ pid: _releaseRuns.pid })
    .from(_releaseRuns)
    .where(
      and(
        isNull(_releaseRuns.finishedAt),
        eq(_releaseRuns.namespace, currentWorktreeName()),
        eq(_releaseRuns.composition, composition),
      ),
    );
  return rows.some((r) => isPidAlive(r.pid));
}

/**
 * Recover the terminal exit code of an orphaned release from the durable
 * per-release log the detached CLI writes (release-logs-<id>.json). Absent file
 * ⇒ no clean terminal signal (a hard SIGKILL) ⇒ keep the -1 failure sentinel.
 * A dead owner pid guarantees the writer is past its log-writing point, so there
 * is no read/write race.
 */
function resolveOrphanExitCode(releaseId: string): number {
  const name = currentWorktreeName();
  const worktreesDir = join(SINGULARITY_DIR, "worktrees");
  for (const path of [
    join(worktreesDir, name, `release-logs-${releaseId}.json`),
    join(worktreesDir, `${name}-release-logs-${releaseId}.json`),
  ]) {
    try {
      const parsed = JSON.parse(readFileSync(path, "utf-8")) as { exitCode?: number };
      return typeof parsed.exitCode === "number" ? parsed.exitCode : -1;
    } catch (err) {
      if (
        (err as NodeJS.ErrnoException).code !== "ENOENT" &&
        !(err instanceof SyntaxError)
      ) throw err;
      continue;
    }
  }
  return -1;
}

/**
 * Close any unfinished release_runs rows for this namespace whose owning process
 * is dead, stamping the recovered exit code + a terminal status. Scoped to this
 * namespace: a worktree DB forks main's rows, and reaping those inherited
 * (foreign-pid) releases would surface phantom state in every worktree. Runs on
 * boot and before each claim so a crashed owner never permanently wedges the
 * release_runs_inflight_uniq lock.
 */
export async function reconcileOrphanReleases(): Promise<void> {
  const unfinished = await db
    .select({ id: _releaseRuns.id, pid: _releaseRuns.pid })
    .from(_releaseRuns)
    .where(and(isNull(_releaseRuns.finishedAt), eq(_releaseRuns.namespace, currentWorktreeName())));
  const orphans = unfinished.filter((r) => !isPidAlive(r.pid));
  if (orphans.length === 0) return;
  const finishedAt = new Date();
  for (const orphan of orphans) {
    const exitCode = resolveOrphanExitCode(orphan.id);
    await db
      .update(_releaseRuns)
      .set({ finishedAt, exitCode, status: exitCode === 0 ? "succeeded" : "failed" })
      .where(eq(_releaseRuns.id, orphan.id));
  }
  // No hand-notify: the history resource declares identityTable "release_runs",
  // so the L4 DB change-feed delivers these UPDATEs to its subscribers.
}

// node-postgres surfaces a unique_violation as SQLSTATE 23505. The partial unique
// index release_runs_inflight_uniq throws this when a second in-flight release for
// the same (namespace, composition) is claimed concurrently — the signal that this
// caller lost the race.
function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === "23505";
}

export function triggerRelease(composition: string, target: string): void {
  if (inflight) return;
  inflight = true;
  void (async () => {
    try {
      if (await isAnyReleaseAlive(composition)) return;
      await doRunRelease(composition, target);
    } catch (err) {
      releaseLog.publish(
        `Release error: ${err instanceof Error ? err.message : String(err)}`,
        "stderr",
      );
    } finally {
      inflight = false;
    }
  })();
}

interface ReleaseManifest {
  composition: string;
  target: string;
  platform: string;
  builtAt: string;
  port: number;
}

async function doRunRelease(composition: string, target: string): Promise<void> {
  const targetDef = releaseTargetById(target);
  // The endpoint validates the target before calling, but guard here too so a
  // direct call can't spawn the CLI with no args.
  if (!targetDef?.implemented) {
    throw new Error(`Unknown or unimplemented release target: ${target}`);
  }

  // A crashed prior owner can leave an unfinished row that the partial unique
  // index treats as a live claim and that would block every future release of
  // this composition. Close those dead-owner rows before claiming.
  await reconcileOrphanReleases();

  const startMs = Date.now();
  const releaseId = `release-${startMs}-${Math.random().toString(36).slice(2, 8)}`;
  const out = releaseOutDir(composition, target);

  // Claim the single in-flight slot atomically. Insert *before* spawning so the
  // claiming INSERT — guarded by release_runs_inflight_uniq — is what wins or
  // loses the race, not a check-then-act with a TOCTOU window. Seed pid with this
  // backend's own (live) pid so the row is protected from the orphan reconciler
  // from the instant it exists; it is swapped to the detached child pid below.
  try {
    await db.insert(_releaseRuns).values({
      id: releaseId,
      composition,
      target,
      pid: process.pid,
      namespace: currentWorktreeName(),
    });
  } catch (err) {
    if (isUniqueViolation(err)) return;
    throw err;
  }

  const proc = Bun.spawn(
    [
      "./singularity",
      "release",
      "--composition",
      composition,
      ...targetDef.buildArgs(composition),
      "--dev",
      "--out",
      out,
    ],
    {
      cwd: REPO_ROOT,
      stdout: "pipe",
      stderr: "pipe",
      detached: true,
    },
  );

  await db.update(_releaseRuns).set({ pid: proc.pid }).where(eq(_releaseRuns.id, releaseId));

  const allLines: Array<{ text: string; stream: "stdout" | "stderr" }> = [];

  async function streamLines(
    stream: ReadableStream<Uint8Array> | null,
    streamType: "stdout" | "stderr",
  ) {
    if (!stream) return;
    const decoder = new TextDecoder();
    for await (const chunk of stream as unknown as AsyncIterable<Uint8Array>) {
      for (const line of decoder.decode(chunk).split("\n")) {
        if (line) {
          releaseLog.publish(line, streamType);
          allLines.push({ text: line, stream: streamType });
        }
      }
    }
  }

  await Promise.all([
    streamLines(proc.stdout, "stdout"),
    streamLines(proc.stderr, "stderr"),
  ]);

  const exitCode = await proc.exited;

  // Read the artifact manifest the CLI writes on success (composition, target,
  // platform, builtAt, port).
  let manifest: ReleaseManifest | null = null;
  try {
    manifest = JSON.parse(readFileSync(join(out, "RELEASE.json"), "utf-8")) as ReleaseManifest;
  } catch (err) {
    if (
      (err as NodeJS.ErrnoException).code !== "ENOENT" &&
      !(err instanceof SyntaxError)
    ) throw err;
  }

  const succeeded = exitCode === 0 && manifest != null;
  releaseLog.publish(
    succeeded ? "Release succeeded" : `Release failed (exit ${exitCode})`,
  );

  // On failure, persist a per-release fallback artifact so the detail pane can
  // serve the captured logs after the live stream ends (mirror build's
  // writeFileSync+rename atomic write).
  if (!succeeded && allLines.length > 0) {
    const worktreeName = process.env.SINGULARITY_WORKTREE;
    if (worktreeName) {
      const worktreeDir = join(SINGULARITY_DIR, "worktrees", worktreeName);
      mkdirSync(worktreeDir, { recursive: true });
      const logPath = join(worktreeDir, `release-logs-${releaseId}.json`);
      if (!existsSync(logPath)) {
        const tmp = `${logPath}.tmp.${process.pid}`;
        writeFileSync(tmp, JSON.stringify({ exitCode, lines: allLines }) + "\n");
        renameSync(tmp, logPath);
      }
    }
  }

  await db
    .update(_releaseRuns)
    .set({
      finishedAt: new Date(),
      exitCode,
      status: succeeded ? "succeeded" : "failed",
      platform: manifest?.platform ?? null,
      artifactPath: succeeded ? out : null,
      port: manifest?.port ?? null,
      error: succeeded
        ? null
        : `Release exited with code ${exitCode} after ${Math.round((Date.now() - startMs) / 1000)}s`,
    })
    .where(eq(_releaseRuns.id, releaseId));
}
