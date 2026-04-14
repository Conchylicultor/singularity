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
    .option("--skip-checks", "Skip pre-push validation checks (unsafe)")
    .option(
      "--from-main",
      "DANGER: commit and push directly from main, bypassing the worktree-merge flow. " +
        "Agents MUST NOT pass this flag without explicit user approval in the current conversation. " +
        "Intended only when a human is driving and the worktree detour would be pure churn " +
        "(e.g. small fixes already staged on main). Still runs checks.",
    )
    .action(async (opts: {
      message?: string;
      skipChecks?: boolean;
      fromMain?: boolean;
    }) => {
      const branch = await getCurrentBranch();
      const onMain = branch === "main";

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
      if (opts.fromMain) {
        console.log("Pulling main...");
        await exec(["git", "pull", "--rebase"]);
        if (!opts.skipChecks) {
          console.log("Running checks...");
          const ok = await runChecks();
          if (!ok) {
            console.error(
              "Checks failed after rebase. Fix the issue and re-run ./singularity push " +
                "(your commit is still on HEAD; use `git reset --soft HEAD~1` to unstage it if needed), " +
                "or re-run with --skip-checks.",
            );
            process.exit(1);
          }
        }
        console.log("Pushing main...");
        await exec(["git", "push"]);
        console.log("Done. Pushed directly from main.");
        return;
      }

      // 2. Pull main to ensure it's up to date before merging
      const mainWorktree = await getMainWorktree();
      console.log("Pulling main...");
      await exec(["git", "pull", "--ff-only"], mainWorktree);

      // 3. Rebase onto main so the merge is always a fast-forward
      const { exitCode: rebaseExit } = await run(["git", "rebase", "main"]);
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
      if (!opts.skipChecks) {
        console.log("Running checks...");
        const ok = await runChecks();
        if (!ok) {
          console.error(
            `Checks failed after rebasing ${branch} onto main. ` +
              `Fix the issue and re-run ./singularity push ` +
              `(your commits are on ${branch}; use \`git reset --soft HEAD~1\` to unstage the last one if needed), ` +
              `or re-run with --skip-checks.`,
          );
          process.exit(1);
        }
      }

      // 5. Push the branch (force since rebase rewrites history — safe for single-owner worktree branches)
      console.log(`Pushing branch ${branch}...`);
      await exec(["git", "push", "--force-with-lease", "-u", "origin", branch]);

      // 5. Fast-forward merge into main
      console.log(`Merging ${branch} into main...`);
      await exec(["git", "merge", "--ff-only", branch], mainWorktree);

      // 6. Push main
      console.log("Pushing main...");
      await exec(["git", "push"], mainWorktree);

      // 7. Install deps in main so its long-running backend matches the code
      //    it will respawn with. Without this, a dependency added in a worktree
      //    lands in main's package.json but not its node_modules, and the
      //    next backend respawn (via gateway restart or idle sweep) crashes.
      console.log("Installing deps in main...");
      await exec(["bun", "install"], mainWorktree);

      console.log(`Done. ${branch} merged into main and pushed.`);
    });
}
