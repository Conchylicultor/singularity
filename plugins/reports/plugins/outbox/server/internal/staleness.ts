import { spawnCaptured } from "@plugins/infra/plugins/spawn/core";
import type { OutboxCode } from "../../core";

/** Same generosity as the writer's merge-base read — see merge-base.ts. */
const DIFF_TIMEOUT_MS = 30_000;

/** Whether an entry's code still stands on main as its writer saw it. */
export type StalenessVerdict =
  /** Main has not touched the entry's files since its branch point: file it. */
  | { stale: false }
  /** Main changed these of the entry's files since its branch point: drop it. */
  | { stale: true; changed: string[] };

/**
 * The staleness rule: has main changed any of `code.paths` between the writer's
 * merge-base and main's tip?
 *
 * - **No** — the code the report is about still exists on main as written, so
 *   the report is filed. That includes a problem the writer's OWN branch
 *   introduced (its change is not on main, so main's copy of those files did
 *   not move): exactly the regression a report should name.
 * - **Yes** — main may already have fixed it, so the report is dropped.
 *
 * Only a FIX made inside the named files is seen. One made elsewhere still lets
 * an older branch file, until that branch rebases — the rule errs toward
 * reporting, never toward silence.
 *
 * `--name-only` rather than `--quiet`: the same question, and the answer names
 * the files a drop is logged with. Any failure — an unknown commit (a merge-base
 * main's repo does not have), a timeout — THROWS: "cannot tell" is never
 * evidence for either verdict.
 */
export async function checkStaleness(
  code: OutboxCode,
  repo: { root: string; mainRef: string },
): Promise<StalenessVerdict> {
  // No paths name no code: nothing to compare. (An empty pathspec would diff
  // the whole tree, and drop nearly everything.)
  if (code.paths.length === 0) return { stale: false };
  const argv = [
    "git",
    "diff",
    "--name-only",
    code.mergeBase,
    repo.mainRef,
    "--",
    ...code.paths,
  ];
  const result = await spawnCaptured(argv, {
    cwd: repo.root,
    timeoutMs: DIFF_TIMEOUT_MS,
  });
  if (result.timedOut) {
    throw new Error(
      `staleness check timed out after ${DIFF_TIMEOUT_MS} ms: ${argv.join(" ")}`,
    );
  }
  if (result.exitCode !== 0) {
    throw new Error(
      `staleness check failed (exit ${result.exitCode}): ${argv.join(" ")}\n${result.stderr.trim()}`,
    );
  }
  const changed = result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return changed.length === 0 ? { stale: false } : { stale: true, changed };
}
