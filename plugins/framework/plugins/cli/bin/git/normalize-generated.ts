import { spawnCaptured, spawnPassthrough } from "@plugins/infra/plugins/spawn/core";
import { clearMergeMarkers, findClaudeMdConflicts, readMergeMarkers } from "../../core";

/**
 * Env flag that suppresses the `.githooks/post-rewrite` hook for a child git
 * process. Set by the two callers that own the normalize themselves:
 *   - `push`, around its own rebase — it installs the rebased lockfile BEFORE
 *     normalizing, an ordering the hook cannot know about;
 *   - this module's own amend, which would otherwise re-enter the hook.
 */
export const SKIP_POST_REWRITE_ENV = "SINGULARITY_SKIP_POST_REWRITE";

async function exec(cmd: string[], cwd: string, env?: Record<string, string | undefined>): Promise<void> {
  const { exitCode } = await spawnPassthrough(cmd, { cwd, env });
  if (exitCode !== 0) process.exit(1);
}

async function isDirty(cwd: string): Promise<boolean> {
  const result = await spawnCaptured(["git", "status", "--porcelain"], { cwd });
  if (result.exitCode !== 0) {
    console.error(`git status failed (exit ${result.exitCode})`);
    if (result.stderr.trim()) console.error(result.stderr.trim());
    process.exit(1);
  }
  return result.stdout.trim().length > 0;
}

/**
 * Re-derive canonical content for every generated artifact a merge driver
 * auto-resolved, and fold the result into the head commit.
 *
 * WHY IT EXISTS: the `.gitattributes` drivers (`scripts/regen-*.sh`) resolve a
 * generated file by taking the UPSTREAM side verbatim — a knowingly-wrong tree
 * that is cheap to produce and trivially repairable, because the file is a pure
 * function of sources that git just merged correctly. Each driver records that
 * it fired by dropping a marker; this function is the repair the markers exist
 * to trigger. Without markers it is a no-op, so calling it after any merge/
 * rebase costs nothing.
 *
 * WHO CALLS IT: `push` (before and after its own rebase) and the
 * `post-rewrite` git hook (after ANY other rebase / amend). The hook is what
 * makes the repair independent of which command drove the rebase — a manual
 * `git fetch origin main && git rebase origin/main` self-heals exactly like a
 * push does. `build` reaches the same end state by regenerating everything
 * unconditionally, and clears the markers itself.
 *
 * Two things it refuses to paper over:
 *   - a hand-edited branch-local migration (`regen-migrations` detects it and
 *     aborts before resetting anything);
 *   - a conflict marker left in CLAUDE.md PROSE, which no regeneration can fix.
 *
 * @param pushId stamped as a `Singularity-Push` trailer on the amend, so a push
 *        that normalizes keeps its commits grouped into one push event. Omitted
 *        by the hook, whose amend must preserve the message exactly as-is.
 */
export async function normalizeGeneratedArtifacts(
  root: string,
  opts: { pushId?: string } = {},
): Promise<void> {
  const markers = readMergeMarkers(root);
  if (markers.length === 0) return; // clean merge, no auto-resolve happened

  console.log(`Normalizing artifacts auto-resolved during merge (${markers.join(", ")})...`);

  if (markers.includes("migrations")) {
    await exec(["bun", "plugins/framework/plugins/cli/bin/index.ts", "regen-migrations"], root);
  }

  if (markers.includes("generated")) {
    await exec(["bun", "plugins/framework/plugins/cli/bin/index.ts", "regen-generated"], root);
  }

  // Markers are consumed only once every regen above has SUCCEEDED — a regen
  // that exits non-zero kills this process with the marker still in place, so
  // the next push/check still sees the un-normalized state.
  clearMergeMarkers(root);

  if (markers.includes("generated")) {
    const conflicted = findClaudeMdConflicts(root);
    if (conflicted.length) {
      console.error(
        [
          "",
          "Real merge conflict in plugin CLAUDE.md prose section(s):",
          ...conflicted.map((f) => `  ${f}`),
          "",
          "These are hand-written and require manual resolution. Edit the files,",
          "remove the conflict markers, then re-run ./singularity push.",
        ].join("\n"),
      );
      process.exit(1);
    }
  }

  if (!(await isDirty(root))) return;
  console.log("Amending head commit with regenerated artifacts...");
  // The hook re-enters here via `git commit --amend`; the env flag closes that
  // loop. (The markers are already cleared above, so the guard is belt-and-
  // braces — but it makes the no-recursion property local to this call.)
  const env = { ...process.env, [SKIP_POST_REWRITE_ENV]: "1" };
  await exec(["git", "add", "-A"], root, env);
  await exec(
    [
      "git",
      "-c",
      "trailer.ifexists=replace",
      "commit",
      "--amend",
      "--no-edit",
      ...(opts.pushId ? ["--trailer", `Singularity-Push=${opts.pushId}`] : []),
    ],
    root,
    env,
  );
}
