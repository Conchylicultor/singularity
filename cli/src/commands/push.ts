import type { Command } from "commander";

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
    .description("Merge the current worktree branch into main and push")
    .action(async () => {
      const branch = await getCurrentBranch();

      if (branch === "main") {
        console.error("Already on main — nothing to merge.");
        process.exit(1);
      }

      // 1. Check for uncommitted changes
      const { stdout: status } = await run(["git", "status", "--porcelain"]);
      if (status) {
        console.error(
          "You have uncommitted changes. Commit or stash them first.",
        );
        process.exit(1);
      }

      // 2. Push the branch to remote
      console.log(`Pushing branch ${branch}...`);
      await exec(["git", "push", "-u", "origin", branch]);

      // 3. Merge into main from the main worktree
      const mainWorktree = await getMainWorktree();
      console.log(`Merging ${branch} into main...`);
      await exec(["git", "merge", branch], mainWorktree);

      // 4. Push main
      console.log("Pushing main...");
      await exec(["git", "push"], mainWorktree);

      console.log(`Done. ${branch} merged into main and pushed.`);
    });
}
