import { GIT } from "@plugins/infra/plugins/paths/server";

export interface GitHygiene {
  unpushedCount: number;
  isDirty: boolean;
}

// The conservative answer: "assume there is something to lose". Returned for
// EVERY path where we failed to establish otherwise, so a hygiene probe that
// could not run can never certify a worktree as safe to delete.
//
// `isDirty: true` alone is enough to fail `isSafeToReap`; the sentinel
// unpushedCount makes the reason legible in the UI rather than reading as a
// genuinely clean tree.
const HYGIENE_UNKNOWN: GitHygiene = { unpushedCount: 1, isDirty: true };

/**
 * PURE helper (exported for unit testing): classify `git status --porcelain=v2
 * --branch` output. Split out from the spawn so the parsing — which is where the
 * fail-open bugs lived — is directly testable.
 *
 * Returns the conservative HYGIENE_UNKNOWN when the output does not prove the
 * tree is clean and published:
 *
 *   - No `# branch.oid` header ⇒ this is not parseable status output at all
 *     (empty stdout from a failed git, a truncated read). Previously an empty
 *     string sailed through as `{unpushedCount: 0, isDirty: false}` — "clean,
 *     nothing unpushed", the maximally-reapable answer.
 *   - No `# branch.ab` header ⇒ the branch has NO UPSTREAM. git only emits that
 *     line when a tracking branch exists, so a never-pushed branch produced no
 *     match and read as 0 unpushed. Every commit on such a branch exists ONLY in
 *     that worktree, which is the strongest possible reason not to delete it.
 */
export function classifyGitStatus(statusOut: string): GitHygiene {
  const lines = statusOut.split("\n");

  // `# branch.oid` is emitted unconditionally by --porcelain=v2 --branch, so its
  // absence means we are not looking at valid status output.
  if (!lines.some((l) => l.startsWith("# branch.oid "))) return HYGIENE_UNKNOWN;

  // Any non-header line is a file change.
  const isDirty = lines.some((l) => l.length > 0 && !l.startsWith("#"));

  // Header line: "# branch.ab +<ahead> -<behind>". Emitted ONLY when the branch
  // has an upstream — no upstream means nothing has been published anywhere.
  const abLine = lines.find((l) => l.startsWith("# branch.ab "));
  if (!abLine)
    return { unpushedCount: HYGIENE_UNKNOWN.unpushedCount, isDirty: true };

  const aheadMatch = abLine.match(/\+(\d+)/);
  if (!aheadMatch) return HYGIENE_UNKNOWN;

  return { unpushedCount: parseInt(aheadMatch[1]!, 10), isDirty };
}

// `git status --porcelain=v2 --branch` gives us branch tracking info (ahead N)
// AND dirty working tree in one subprocess. `du` was removed — it takes ~5s per
// 50-dir batch on macOS even for empty dirs, making it the dominant bottleneck.
//
// FAILURE IS CONSERVATIVE, and the exit-code check is the load-bearing half:
// `Bun.spawn` does NOT throw on a nonzero exit, so a failed `git status` used to
// fall out of the try block with empty stdout and parse as "clean, 0 unpushed"
// — the catch's conservative default was unreachable for the single most likely
// failure mode. Both halves now funnel into HYGIENE_UNKNOWN.
export async function getGitHygiene(wtPath: string): Promise<GitHygiene> {
  try {
    const p = Bun.spawn(
      [
        GIT,
        "--no-optional-locks",
        "-C",
        wtPath,
        "status",
        "--porcelain=v2",
        "--branch",
      ],
      { stdout: "pipe", stderr: "pipe" },
    );
    const [statusOut, exitCode] = await Promise.all([
      new Response(p.stdout).text(),
      p.exited,
    ]);
    if (exitCode !== 0) return HYGIENE_UNKNOWN;
    return classifyGitStatus(statusOut);
    // eslint-disable-next-line promise-safety/no-bare-catch -- git spawn can fail for many reasons (binary missing, worktree deleted mid-flight, not a git repo); all map to the same conservative safe default (assume dirty = not safe to delete), so every error is correctly handled here
  } catch {
    return HYGIENE_UNKNOWN;
  }
}

// Allowlist of task statuses known to have no live agent session AND nothing the
// user still means to come back to. Intentionally explicit: unknown/future
// statuses default to not-safe.
//
// `held` is excluded ON PURPOSE, and is not an oversight to "fix": holding is the
// user parking work they intend to resume, so its worktree must survive the clean
// path however long it idles. Only the hard floor in reap-policy (90d) can take a
// held worktree. The mirror of this rule on the transcript side is
// `listRetainedConversations` (conversations/transcript-retention).
const DELETABLE_TASK_STATUSES = new Set(["done", "dropped"]);

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
  // "The user has not explicitly finished with this attempt" — attempts_v.retained
  // (the has_open_conv rollup, `conversation.status <> 'done'`). NOT
  // attempts_v.active: that is the progress notion, and a conversation whose pane
  // was killed to reclaim resources reads inactive while still being fully
  // resumable. Pass `false` only where there is no attempt to speak for (a dir
  // orphan with no row at all).
  retained: boolean;
}

// Single definition of "nothing to lose, safe to auto-reap". Used by both the
// UI safe-to-delete badge (handle-list) and the scheduled reaper (reap-policy),
// so the two can never drift again.
//
// Reapability is USER INTENT, never process liveness. Two independent proofs that
// the user is finished are required, and they are checked before anything else:
//   - `retained` false — every conversation on the attempt was explicitly closed
//     (`exit_clean` / the UI Exit actions are the only writers of `done`).
//   - `taskDeletable` — the task itself is done or dropped (`held` excluded).
// A dormant agent proves neither. This ordering is why the guard now also covers
// the orphan branch below: a checkout that vanished while its conversation is
// still open leaves the fork DB as the only copy of that attempt's state, so
// dropping it would finish destroying work the user can still ask for.
export function isSafeToReap(i: SafetyInput): boolean {
  if (i.retained) return false; // the user has not finished with this — never reap
  if (!i.dirExists && i.dbPresent) return true; // orphan: nothing to lose, just drop the DB
  return (
    i.dirExists &&
    i.unpushedCount === 0 &&
    !i.isDirty &&
    i.taskDeletable &&
    i.ageMs >= SAFE_REAP_AGE_MS
  );
}
