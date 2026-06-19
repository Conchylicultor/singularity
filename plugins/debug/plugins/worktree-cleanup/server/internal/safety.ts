import { dirname, join } from "node:path";
import { GIT } from "@plugins/infra/plugins/paths/server";

// `git status --porcelain=v2 --branch` gives us branch tracking info (ahead N)
// AND dirty working tree in one subprocess. `du` was removed — it takes ~5s per
// 50-dir batch on macOS even for empty dirs, making it the dominant bottleneck.
export async function getGitHygiene(
  wtPath: string,
): Promise<{ unpushedCount: number; isDirty: boolean }> {
  try {
    const p = Bun.spawn(
      [GIT, "--no-optional-locks", "-C", wtPath, "status", "--porcelain=v2", "--branch"],
      { stdout: "pipe", stderr: "pipe" },
    );
    await p.exited;
    const statusOut = await new Response(p.stdout).text();

    // Header line: "# branch.ab +<ahead> -<behind>"
    const abLine = statusOut.split("\n").find((l) => l.startsWith("# branch.ab "));
    const aheadMatch = abLine?.match(/\+(\d+)/);
    const unpushedCount = aheadMatch ? parseInt(aheadMatch[1]!, 10) : 0;

    // Any non-header line is a file change
    const isDirty = statusOut.split("\n").some((l) => l.length > 0 && !l.startsWith("#"));

    return { unpushedCount, isDirty };
  // eslint-disable-next-line promise-safety/no-bare-catch -- git spawn can fail for many reasons (binary missing, worktree deleted mid-flight, not a git repo); all map to the same conservative safe default (assume dirty = not safe to delete), so every error is correctly handled here
  } catch {
    return { unpushedCount: 0, isDirty: true };
  }
}

// Allowlist of task statuses known to have no live agent session.
// Intentionally explicit: unknown/future statuses default to not-safe.
const DELETABLE_TASK_STATUSES = new Set([
  "done",
  "dropped",
]);

export function isTaskDeletable(status: string | undefined): boolean {
  return status ? DELETABLE_TASK_STATUSES.has(status) : true;
}

export const SAFE_REAP_AGE_MS = 72 * 60 * 60 * 1000;

export interface SafetyInput {
  dirExists: boolean;
  dbPresent: boolean;
  unpushedCount: number;
  isDirty: boolean;
  taskDeletable: boolean;
  ageMs: number;
}

// Single definition of "nothing to lose, safe to auto-reap". Used by both the
// UI safe-to-delete badge (handle-list) and the scheduled reaper (reap-policy),
// so the two can never drift again.
export function isSafeToReap(i: SafetyInput): boolean {
  if (!i.dirExists && i.dbPresent) return true; // orphan: nothing to lose, just drop the DB
  return (
    i.dirExists &&
    i.unpushedCount === 0 &&
    !i.isDirty &&
    i.taskDeletable &&
    i.ageMs >= SAFE_REAP_AGE_MS
  );
}

// A real worktree dir is a DIRECT child of `<root>/.claude/worktrees/`. Anything
// else (the main repo root, /tmp, a hand-edited path) is malformed and must
// never be handed to `git worktree remove`.
export function isCanonicalWorktreePath(path: string, repoRoot: string): boolean {
  return dirname(path) === join(repoRoot, ".claude", "worktrees");
}
