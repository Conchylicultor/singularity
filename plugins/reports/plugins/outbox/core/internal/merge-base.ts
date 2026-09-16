import { spawnCaptured } from "@plugins/infra/plugins/spawn/core";

/**
 * Generous for one cheap git read: the writer is often a check run, whose
 * thread is loaded, and a spurious timeout costs the report its staleness data.
 */
const MERGE_BASE_TIMEOUT_MS = 30_000;

/** The result of asking git where a checkout branched from main. */
export type MergeBaseResult =
  { ok: true; mergeBase: string } | { ok: false; reason: string };

/**
 * `git merge-base HEAD main` in `repoRoot` — the `mergeBase` of an outbox
 * entry's `code` field. Async (a spawn, never `spawnSync`), so a caller on a
 * busy thread does not block it.
 *
 * A result, never a throw: the caller decides what a report with no known branch
 * point is worth (the check runner files it without `code`, and says so).
 */
export async function mergeBaseWithMain(
  repoRoot: string,
): Promise<MergeBaseResult> {
  let result;
  try {
    result = await spawnCaptured(["git", "merge-base", "HEAD", "main"], {
      cwd: repoRoot,
      timeoutMs: MERGE_BASE_TIMEOUT_MS,
    });
  } catch (error) {
    // The spawn itself failed (no git on PATH, a vanished cwd) — the same
    // "branch point unknown" answer as a non-zero exit, with its own reason.
    return {
      ok: false,
      reason: `git merge-base could not start: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  const mergeBase = result.stdout.trim();
  if (result.exitCode === 0 && /^[0-9a-f]{40,64}$/.test(mergeBase)) {
    return { ok: true, mergeBase };
  }
  return {
    ok: false,
    reason: result.timedOut
      ? `git merge-base timed out after ${MERGE_BASE_TIMEOUT_MS} ms`
      : `git merge-base exited ${result.exitCode}: ${result.stderr.trim() || mergeBase}`,
  };
}
