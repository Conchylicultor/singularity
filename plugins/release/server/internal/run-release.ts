import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { runTracked } from "@plugins/infra/plugins/runtime-profiler/core";
import {
  REPO_ROOT,
  currentWorktreeName,
  worktreeDataDir,
  worktreeArtifacts,
  pruneWorktreeReleaseArtifacts,
} from "@plugins/infra/plugins/paths/server";
import { releaseTargetById } from "../../core/targets";
import type { ReleaseIntent } from "../../core/endpoints";
import { collectReleaseEnv } from "./env-provider";
import {
  releaseOutDir,
  newReleaseRunId,
} from "@plugins/release/plugins/bundles/server";
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
  const path = worktreeArtifacts.releaseLogs(name, releaseId);
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as {
      exitCode?: number;
    };
    return typeof parsed.exitCode === "number" ? parsed.exitCode : -1;
  } catch (err) {
    if (
      (err as NodeJS.ErrnoException).code !== "ENOENT" &&
      !(err instanceof SyntaxError)
    )
      throw err;
    return -1;
  }
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
    .where(
      and(
        isNull(_releaseRuns.finishedAt),
        eq(_releaseRuns.namespace, currentWorktreeName()),
      ),
    );
  const orphans = unfinished.filter((r) => !isPidAlive(r.pid));
  if (orphans.length === 0) return;
  const finishedAt = new Date();
  for (const orphan of orphans) {
    const exitCode = resolveOrphanExitCode(orphan.id);
    await db
      .update(_releaseRuns)
      .set({
        finishedAt,
        exitCode,
        status: exitCode === 0 ? "succeeded" : "failed",
      })
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

/**
 * What to cut, and why.
 *
 * An options object rather than positional args because `intent` is the
 * parameter that changes what the artifact IS (staged vs shippable), and a third
 * positional would read as an afterthought at every call site.
 */
export interface TriggerReleaseOptions {
  composition: string;
  target: string;
  /** See `ReleaseIntent` — decides `--dev` vs `--platform <tag>`, and `kind`. */
  intent: ReleaseIntent;
}

/**
 * What one release attempt did.
 *
 * A discriminated result rather than a thrown error, because the interesting
 * non-success — *another release of this composition is already running* — is a
 * legitimate outcome a caller branches on, not a fault. A caller that sequences
 * a release into a larger flow (the Deploy app's `update`) needs to tell "the
 * build refused to start" from "the build ran and failed", and both from an
 * actual bug; a thrown `Error` collapses the first two.
 *
 * `runId` is null exactly when no `release_runs` row was ever claimed.
 */
export type ReleaseOutcome =
  | { ok: true; runId: string; artifactPath: string }
  | {
      ok: false;
      reason: "already-running" | "unimplemented-target" | "failed";
      runId: string | null;
      message: string;
    };

/**
 * Fire-and-forget wrapper around {@link runRelease} for the Studio button: the
 * caller gets nothing back and the outcome is observed through the log channel
 * and `release_runs`.
 *
 * Keeps the in-process `inflight` re-entry guard. `runRelease` itself is NOT
 * guarded by it — the authoritative lock is the DB one (`isAnyReleaseAlive` plus
 * the partial unique index), and a second caller that legitimately awaits a
 * release must not be silently dropped by a module-level boolean.
 */
export function triggerRelease(opts: TriggerReleaseOptions): void {
  if (inflight) return;
  inflight = true;
  void runTracked("release:run", async () => {
    try {
      await runRelease(opts);
    } catch (err) {
      releaseLog.publish(
        `Release error: ${err instanceof Error ? err.message : String(err)}`,
        "stderr",
      );
    } finally {
      inflight = false;
    }
  });
}

interface ReleaseManifest {
  composition: string;
  target: string;
  platform: string;
  builtAt: string;
  port: number;
  /** Provenance the CLI stamps before its artifact phase; absent on old bundles. */
  commitSha?: string;
  commitDirty?: boolean;
}

/**
 * Cut one release and wait for it, start to finish.
 *
 * The single implementation: `triggerRelease` is `void runRelease(...)`, and the
 * Deploy app's `update` sequence awaits it between `converge` and `ship` — which
 * is the reason it is awaitable at all. Every non-success is a value here, so a
 * sequencing caller can stop with the engine's own words instead of guessing
 * from a log line.
 */
export async function runRelease(
  opts: TriggerReleaseOptions,
): Promise<ReleaseOutcome> {
  const { composition, target, intent } = opts;
  const targetDef = releaseTargetById(target);
  // The endpoint validates the target before calling, but guard here too so a
  // direct call can't spawn the CLI with no args. Published as well as returned:
  // the log channel is where `triggerRelease`'s fire-and-forget caller — which
  // discards this value — can still see it.
  if (!targetDef?.implemented) {
    const message = `Unknown or unimplemented release target: ${target}`;
    releaseLog.publish(`Release error: ${message}`, "stderr");
    return { ok: false, reason: "unimplemented-target", runId: null, message };
  }

  // A crashed prior owner can leave an unfinished row that the partial unique
  // index treats as a live claim and that would block every future release of
  // this composition. Close those dead-owner rows before claiming.
  await reconcileOrphanReleases();

  // The durable, cross-restart lock. Checked before the claim so the common case
  // gets the readable answer; the unique index below is what actually holds
  // under a race.
  if (await isAnyReleaseAlive(composition)) {
    return {
      ok: false,
      reason: "already-running",
      runId: null,
      message: `A release of "${composition}" is already running.`,
    };
  }

  const startMs = Date.now();
  const releaseId = newReleaseRunId();
  const out = releaseOutDir(composition, target, releaseId);

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
      // Stamped from the intent, at claim time — before the CLI has produced
      // anything. What a run WAS FOR is decided by the request, not inferred
      // later from whether an artifact happens to be on disk.
      kind: intent.kind,
      pid: process.pid,
      namespace: currentWorktreeName(),
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      // Lost the claim race — the same outcome as the check above, reached the
      // only way that is safe under concurrency. No row of ours exists, hence a
      // null runId.
      return {
        ok: false,
        reason: "already-running",
        runId: null,
        message: `A release of "${composition}" was claimed by another caller.`,
      };
    }
    throw err;
  }

  // Generic, decoupled release-env injection: other plugins contribute extra
  // env vars for this target via the Release.EnvProvider slot (e.g. a future
  // Apple-signing plugin contributes APPLE_* for "tauri"). With zero
  // contributors (or any non-contributed target) this is {} → spawn env stays
  // undefined and behavior is byte-identical to before.
  const extraEnv = await collectReleaseEnv(target);

  // The intent IS the argv difference, and nothing else is:
  //
  // - `staged`    → `--dev`, host platform. Byte-identical to what this spawned
  //                 before intents existed: staged only, no pointer claimed.
  // - `candidate` → NO `--dev` (it must pack, or it is not shippable) plus
  //                 `--platform <tag>` (it must be built for the host that will
  //                 run it, which is discovered, never typed).
  const intentArgs =
    intent.kind === "staged" ? ["--dev"] : ["--platform", intent.platform];

  const proc = Bun.spawn(
    [
      "./singularity",
      "release",
      "--composition",
      composition,
      ...targetDef.buildArgs(composition),
      ...intentArgs,
      "--out",
      out,
    ],
    {
      cwd: REPO_ROOT,
      stdout: "pipe",
      stderr: "pipe",
      detached: true,
      env: Object.keys(extraEnv).length
        ? { ...process.env, ...extraEnv }
        : undefined,
    },
  );

  await db
    .update(_releaseRuns)
    .set({ pid: proc.pid })
    .where(eq(_releaseRuns.id, releaseId));

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
    manifest = JSON.parse(
      readFileSync(join(out, "RELEASE.json"), "utf-8"),
    ) as ReleaseManifest;
  } catch (err) {
    if (
      (err as NodeJS.ErrnoException).code !== "ENOENT" &&
      !(err instanceof SyntaxError)
    )
      throw err;
  }

  const succeeded = exitCode === 0 && manifest != null;
  releaseLog.publish(
    succeeded ? "Release succeeded" : `Release failed (exit ${exitCode})`,
  );

  // On failure, persist a per-release fallback artifact so the detail pane can
  // serve the captured logs after the live stream ends (mirror build's
  // writeFileSync+rename atomic write).
  if (!succeeded && allLines.length > 0) {
    const worktreeName = currentWorktreeName();
    const worktreeDir = worktreeDataDir(worktreeName);
    mkdirSync(worktreeDir, { recursive: true });
    const logPath = worktreeArtifacts.releaseLogs(worktreeName, releaseId);
    if (!existsSync(logPath)) {
      const tmp = `${logPath}.tmp.${process.pid}`;
      writeFileSync(tmp, JSON.stringify({ exitCode, lines: allLines }) + "\n");
      renameSync(tmp, logPath);
    }
    // Cap the per-release logs to a bounded window (mirror build's
    // prune-on-write): writing a new fallback log trims the old ones, so a
    // long-lived namespace can't accumulate them unbounded.
    pruneWorktreeReleaseArtifacts(worktreeName);
  }

  // Computed unconditionally so the row's `error` column and this function's
  // returned `message` are literally the same string: a caller that reports the
  // failure and a user who later opens the run detail must read one sentence,
  // not two wordings of it.
  const failureMessage = `Release exited with code ${exitCode} after ${Math.round(
    (Date.now() - startMs) / 1000,
  )}s`;

  await db
    .update(_releaseRuns)
    .set({
      finishedAt: new Date(),
      exitCode,
      status: succeeded ? "succeeded" : "failed",
      platform: manifest?.platform ?? null,
      artifactPath: succeeded ? out : null,
      port: manifest?.port ?? null,
      // Copied off the manifest, never re-read from git here: the run's source
      // state is what the CLI saw BEFORE its artifact phase, and this backend
      // reads the row long after that tree has moved on.
      commitSha: manifest?.commitSha ?? null,
      commitDirty: manifest?.commitDirty ?? null,
      error: succeeded ? null : failureMessage,
    })
    .where(eq(_releaseRuns.id, releaseId));

  return succeeded
    ? { ok: true, runId: releaseId, artifactPath: out }
    : {
        ok: false,
        reason: "failed",
        runId: releaseId,
        message: failureMessage,
      };
}
