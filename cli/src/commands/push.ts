import type { Command } from "commander";
import { runChecks } from "../checks";

async function run(
  cmd: string[],
  cwd?: string,
): Promise<{ stdout: string; exitCode: number }> {
  const proc = Bun.spawn(cmd, {
    cwd,
    stdout: "pipe",
    stderr: "inherit",
  });
  const stdout = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;
  return { stdout: stdout.trim(), exitCode };
}

async function exec(cmd: string[], cwd?: string): Promise<void> {
  const proc = Bun.spawn(cmd, {
    cwd,
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    process.exit(1);
  }
}

async function getMainWorktree(): Promise<string> {
  const { stdout } = await run(["git", "worktree", "list", "--porcelain"]);
  // First worktree listed is always the main one
  const match = stdout.match(/^worktree (.+)$/m);
  if (!match) {
    console.error("Could not determine main worktree");
    process.exit(1);
  }
  return match[1];
}

async function getCurrentBranch(): Promise<string> {
  const { stdout, exitCode } = await run([
    "git",
    "rev-parse",
    "--abbrev-ref",
    "HEAD",
  ]);
  if (exitCode !== 0 || !stdout) {
    console.error("Could not determine current branch");
    process.exit(1);
  }
  return stdout;
}

export function registerPush(program: Command) {
  program
    .command("push")
    .description("Commit (if -m provided), merge into main, and push")
    .option("-m, --message <msg>", "Commit message — stages and commits all changes before pushing")
    .option(
      "--from-main",
      "DANGER: commit and push directly from main, bypassing the worktree-merge flow. " +
        "Agents MUST NOT pass this flag without explicit user approval in the current conversation. " +
        "Intended only when a human is driving and the worktree detour would be pure churn " +
        "(e.g. small fixes already staged on main). Still runs checks.",
    )
    .action(async (opts: {
      message?: string;
      fromMain?: boolean;
    }) => {
      const branch = await getCurrentBranch();
      const onMain = branch === "main";

      // One push id per invocation; every commit that lands on main as part of
      // this push gets stamped with it (via `git commit --trailer` for the
      // --from-main path, and via `git rebase --exec` for the worktree path).
      // Watchers on every namespace read the trailer to group commits into a
      // single push event.
      const pushId = crypto.randomUUID();

      if (onMain && !opts.fromMain) {
        console.error("Already on main — nothing to merge.");
        process.exit(1);
      }
      if (opts.fromMain && !onMain) {
        console.error(`--from-main requires being on main (currently on ${branch}).`);
        process.exit(1);
      }
      if (opts.fromMain && !opts.message) {
        console.error('--from-main requires -m "commit message".');
        process.exit(1);
      }

      // 1. Commit if -m provided, otherwise require clean tree
      const { stdout: status } = await run(["git", "status", "--porcelain"]);
      if (opts.message) {
        if (status) {
          const files = status.split("\n").map((l) => l.trim());
          console.log(`Committing ${files.length} file(s)${opts.fromMain ? " on main" : ""}:`);
          for (const f of files) console.log(`  ${f}`);
          await exec(["git", "add", "-A"]);
          await exec(["git", "commit", "-m", opts.message]);
        } else if (opts.fromMain) {
          console.error("Nothing to commit.");
          process.exit(1);
        } else {
          console.log("No files to commit.");
        }
      } else if (status) {
        console.error(
          'Missing `-m "commit message"` flag. You have uncommitted changes.',
        );
        process.exit(1);
      }

      // --from-main: rebase onto origin/main and push. No worktree merge.
      // Split fetch + rebase because `git pull --rebase --exec` isn't a valid
      // flag combination on Apple Git (the --exec doesn't propagate to rebase).
      if (opts.fromMain) {
        console.log("Pulling main...");
        await exec(["git", "fetch", "origin", "main"]);
        await exec([
          "git",
          "rebase",
          "origin/main",
          "--exec",
          `git -c trailer.ifexists=replace commit --amend --no-edit --trailer Singularity-Push=${pushId}`,
        ]);
        console.log("Running checks...");
        const ok = await runChecks();
        if (!ok) {
          console.error(
            "Checks failed after rebase. Fix the issue and re-run ./singularity push " +
              "(your commit is still on HEAD; use `git reset --soft HEAD~1` to unstage it if needed).",
          );
          process.exit(1);
        }
        console.log("Pushing main...");
        await exec(["git", "push"]);
        console.log("Done. Pushed directly from main.");
        return;
      }

      // 2. Pull main to ensure it's up to date before merging.
      // Use explicit fetch + merge instead of `git pull --ff-only` because FETCH_HEAD
      // is shared across all worktrees; a prior fetch in another worktree can leave
      // multiple "for-merge" entries, causing "Cannot fast-forward to multiple branches".
      const mainWorktree = await getMainWorktree();
      console.log("Pulling main...");
      await exec(["git", "fetch", "origin", "main"], mainWorktree);
      await exec(["git", "merge", "--ff-only", "origin/main"], mainWorktree);

      // 3. Rebase onto main so the merge is always a fast-forward. `--exec`
      //    runs after each replayed commit, amending it to carry a shared
      //    Singularity-Push trailer so the server can group all commits in
      //    this push as a single event.
      const { exitCode: rebaseExit } = await run([
        "git",
        "rebase",
        "main",
        "--exec",
        `git -c trailer.ifexists=replace commit --amend --no-edit --trailer Singularity-Push=${pushId}`,
      ]);
      if (rebaseExit !== 0) {
        await run(["git", "rebase", "--abort"]);
        console.error(
          [
            `Rebase of ${branch} onto main failed (aborted).`,
            ``,
            `To resolve:`,
            `  1. git fetch origin main`,
            `  2. git rebase origin/main     (NEVER 'git merge' — push re-rebases and a merge commit produces churn)`,
            `  3. Resolve conflicts, then 'git add <files>' and 'git rebase --continue'`,
            `     (or 'git rebase --abort' to bail out)`,
            `  4. Re-run ./singularity push`,
            ``,
            `If main's shape has diverged enough that your commit no longer makes sense,`,
            `'git reset --hard origin/main' + reapply as a fresh commit is cleaner than rebasing.`,
          ].join("\n"),
        );
        process.exit(1);
      }

      // 4. Run checks on the rebased tree — this is exactly what will land on main.
      console.log("Running checks...");
      const ok = await runChecks();
      if (!ok) {
        console.error(
          `Checks failed after rebasing ${branch} onto main. ` +
            `Fix the issue and re-run ./singularity push ` +
            `(your commits are on ${branch}; use \`git reset --soft HEAD~1\` to unstage the last one if needed).`,
        );
        process.exit(1);
      }

      // 5. Push the branch (force since rebase rewrites history — safe for single-owner worktree branches)
      console.log(`Pushing branch ${branch}...`);
      await exec(["git", "push", "--force-with-lease", "-u", "origin", branch]);

      // 6. Fast-forward merge into main
      console.log(`Merging ${branch} into main...`);
      const { exitCode: mergeExit } = await run(
        ["git", "merge", "--ff-only", branch],
        mainWorktree,
      );
      if (mergeExit !== 0) {
        console.error(
          [
            `Fast-forward of main onto ${branch} failed.`,
            ``,
            `Most likely cause: another push landed on main between the rebase (step 3)`,
            `and this merge (step 6), causing main to diverge again.`,
            ``,
            `Fix: re-run ./singularity push`,
            `The rebase will pick up the new main commits and the merge will succeed.`,
          ].join("\n"),
        );
        process.exit(1);
      }

      // 7. Push main
      console.log("Pushing main...");
      await exec(["git", "push"], mainWorktree);

      // Dep sync in main is handled by main's auto-build on the next push
      // event — running `bun install` here races with that build's own
      // `bun install` and can corrupt node_modules.

      console.log(`Done. ${branch} merged into main and pushed.`);
    });
}
