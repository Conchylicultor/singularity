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
    .action(async (opts: { message?: string; skipChecks?: boolean }) => {
      const branch = await getCurrentBranch();

      if (branch === "main") {
        console.error("Already on main — nothing to merge.");
        process.exit(1);
      }

      // 0. Run validation checks
      if (!opts.skipChecks) {
        console.log("Running checks...");
        const ok = await runChecks();
        if (!ok) {
          console.error("Checks failed. Fix issues or re-run with --skip-checks.");
          process.exit(1);
        }
      }

      // 1. Commit if -m provided, otherwise require clean tree
      const { stdout: status } = await run(["git", "status", "--porcelain"]);
      if (opts.message) {
        if (status) {
          const files = status.split("\n").map((l) => l.trim());
          console.log(`Committing ${files.length} file(s):`);
          for (const f of files) console.log(`  ${f}`);
          await exec(["git", "add", "-A"]);
          await exec(["git", "commit", "-m", opts.message]);
        } else {
          console.log("No files to commit.");
        }
      } else if (status) {
        console.error(
          'Missing `-m "commit message"` flag. You have uncommitted changes.',
        );
        process.exit(1);
      }

      // 2. Pull main to ensure it's up to date before merging
      const mainWorktree = await getMainWorktree();
      console.log("Pulling main...");
      await exec(["git", "pull", "--ff-only"], mainWorktree);

      // 3. Rebase onto main so the merge is always a fast-forward
      const { exitCode: rebaseExit } = await run(["git", "rebase", "main"]);
      if (rebaseExit !== 0) {
        console.error(
          `Rebase of ${branch} onto main failed. Resolve conflicts and retry.`,
        );
        await run(["git", "rebase", "--abort"]);
        process.exit(1);
      }

      // 4. Push the branch (force since rebase rewrites history — safe for single-owner worktree branches)
      console.log(`Pushing branch ${branch}...`);
      await exec(["git", "push", "--force-with-lease", "-u", "origin", branch]);

      // 5. Fast-forward merge into main
      console.log(`Merging ${branch} into main...`);
      await exec(["git", "merge", "--ff-only", branch], mainWorktree);

      // 6. Push main
      console.log("Pushing main...");
      await exec(["git", "push"], mainWorktree);

      console.log(`Done. ${branch} merged into main and pushed.`);
    });
}
